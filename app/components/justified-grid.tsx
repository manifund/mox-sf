'use client'

import { useEffect, useState, useRef } from 'react'
import NextImage from 'next/image'

interface MasonryProps {
  images: string[]
  targetRowHeight?: number
  sizes?: Record<string, [number, number]>
}

export default function Masonry({
  images,
  sizes,
  targetRowHeight = 300,
}: MasonryProps) {
  // Use index (number) so we can navigate between images.
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(
    null
  )
  // Look sizes up by src so entries don't have to stay in the same order as
  // `images`. A photo missing from `sizes` falls back to 4:3.
  const initRatios = images.map((src) => {
    const size = sizes?.[src]
    return size ? size[0] / size[1] : 4 / 3
  })
  const [imageRatios, setImageRatios] = useState<number[]>(initRatios)
  const [containerWidth, setContainerWidth] = useState(900)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width)
      }
    }

    updateContainerWidth()
    window.addEventListener('resize', updateContainerWidth)
    return () => window.removeEventListener('resize', updateContainerWidth)
  }, [])

  // Calculate image ratios in case sizes are not provided
  useEffect(() => {
    const loadImages = async () => {
      const ratios = await Promise.all(
        images.map(
          (src) =>
            new Promise<number>((resolve) => {
              const img = new Image()
              img.onload = () => resolve(img.width / img.height)
              img.src = src
            })
        )
      )
      setImageRatios(ratios)
    }

    if (!sizes) {
      loadImages()
    }
  }, [images, sizes])

  // Group images into rows and include a global index for navigation
  const getRows = () => {
    const rows: {
      src: string
      width: number
      height: number
      index: number
    }[][] = []
    const imagesPerRow = containerWidth < 640 ? 2 : 3 // Use 2 images per row on small screens

    for (let i = 0; i < images.length; i += imagesPerRow) {
      const rowImages = images.slice(i, i + imagesPerRow)
      const rowRatios = imageRatios.slice(i, i + imagesPerRow)

      // Skip if ratio data isn't ready
      if (rowRatios.some((r) => !r)) continue

      const spacing = 12 // gap-3 in pixels
      const isLastRow = i + imagesPerRow >= images.length
      const isIncompleteRow = rowImages.length < imagesPerRow

      // For incomplete last rows, add dummy images to simulate a full row for height calculation
      let calculationRatios = [...rowRatios]
      if (isLastRow && isIncompleteRow) {
        // Add average ratio placeholders to fill the row
        const avgRatio =
          rowRatios.reduce((sum, r) => sum + r, 0) / rowRatios.length
        while (calculationRatios.length < imagesPerRow) {
          calculationRatios.push(avgRatio)
        }
      }

      const availableWidth = containerWidth - spacing * (imagesPerRow - 1)

      // Initial widths using the target row height
      const initialWidths = calculationRatios.map(
        (ratio) => targetRowHeight * ratio
      )
      const totalWidth = initialWidths.reduce((sum, w) => sum + w, 0)

      // Scale images so they exactly fill the row
      const scale = availableWidth / totalWidth
      const rowHeight = targetRowHeight * scale

      rows.push(
        rowImages.map((src, j) => ({
          src,
          width: initialWidths[j] * scale,
          height: rowHeight,
          index: i + j, // Global index in the images array
        }))
      )
    }
    return rows
  }

  // Handle keyboard navigation and scroll lock when overlay is active
  useEffect(() => {
    if (selectedImageIndex !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedImageIndex === null) return

      if (e.key === 'Escape') {
        setSelectedImageIndex(null)
      } else if (e.key === 'ArrowLeft' && selectedImageIndex > 0) {
        setSelectedImageIndex(selectedImageIndex - 1)
      } else if (
        e.key === 'ArrowRight' &&
        selectedImageIndex < images.length - 1
      ) {
        setSelectedImageIndex(selectedImageIndex + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedImageIndex, images.length])

  // Touch events for mobile swipe gestures
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchEndX - touchStartX.current
    const threshold = 50 // Minimum swipe distance in pixels

    if (
      diff > threshold &&
      selectedImageIndex !== null &&
      selectedImageIndex > 0
    ) {
      setSelectedImageIndex(selectedImageIndex - 1)
    } else if (
      diff < -threshold &&
      selectedImageIndex !== null &&
      selectedImageIndex < images.length - 1
    ) {
      setSelectedImageIndex(selectedImageIndex + 1)
    }
    touchStartX.current = null
  }

  return (
    <div ref={containerRef}>
      {/* Masonry Grid */}
      <div className="flex flex-col gap-3">
        {getRows().map((row, i) => {
          const imagesPerRow = containerWidth < 640 ? 2 : 3
          const isLastRow = i === getRows().length - 1
          const isIncompleteRow = row.length < imagesPerRow

          return (
            <div
              key={i}
              className={`flex gap-3 ${isLastRow && isIncompleteRow ? 'justify-center' : ''}`}
            >
              {row.map(({ src, width, height, index }) => (
                <NextImage
                  key={index}
                  src={src}
                  alt=""
                  width={Math.round(width)}
                  height={Math.round(height)}
                  style={{
                    width: `${Math.round(width)}px`,
                    height: `${Math.round(height)}px`,
                  }}
                  className="object-cover cursor-pointer hover:opacity-80"
                  loading="lazy"
                  onClick={() => setSelectedImageIndex(index)}
                />
              ))}
            </div>
          )
        })}
      </div>

      {/* Fullscreen Overlay (if an image is selected) */}
      {selectedImageIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Back / Close Button */}
          <button
            onClick={() => setSelectedImageIndex(null)}
            className="absolute top-4 left-4 text-white text-xl px-6 py-4 cursor-pointer bg-black/30 hover:bg-black/50 transition-colors"
            aria-label="Back"
          >
            ← Back
          </button>

          {/* Previous Image Button */}
          {selectedImageIndex > 0 && (
            <button
              onClick={() => setSelectedImageIndex(selectedImageIndex - 1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 transform text-white text-4xl w-12 h-12 cursor-pointer bg-black/30 hover:bg-black/50 transition-colors flex items-center justify-center leading-none"
              aria-label="Previous image"
            >
              ‹
            </button>
          )}

          {/* Next Image Button */}
          {selectedImageIndex < images.length - 1 && (
            <button
              onClick={() => setSelectedImageIndex(selectedImageIndex + 1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 transform text-white text-4xl w-12 h-12 cursor-pointer bg-black/30 hover:bg-black/50 transition-colors flex items-center justify-center leading-none"
              aria-label="Next image"
            >
              ›
            </button>
          )}

          {/* Display the currently selected image */}
          {(() => {
            const displayedImage = images[selectedImageIndex]
            const [origWidth, origHeight] = sizes?.[displayedImage] || [
              800, 600,
            ]
            return (
              <NextImage
                src={displayedImage}
                alt=""
                width={origWidth}
                height={origHeight}
                className="object-contain cursor-pointer"
                onClick={() => setSelectedImageIndex(null)}
                priority={true} // Prioritize loading the full-size image
                quality={100} // Use highest quality for the full-size view
              />
            )
          })()}
        </div>
      )}
    </div>
  )
}
