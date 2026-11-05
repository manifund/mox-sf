'use client'

import Masonry from './components/justified-grid'

export default function GalleryPage() {
  const images = [
    '/images/021.jpg',
    '/images/024.webp',
    '/images/025.webp',
    '/images/010.jpg',
    '/images/014.jpg',
    '/images/020.jpg',
    '/images/016.jpg',
    '/images/018.jpg',
    '/images/026.webp',
  ]

  // Display shape [width, height] for each photo. Photos are cropped to fit,
  // so these set the shape on the page, not the file's real pixel size.
  const sizes = {
    '/images/021.jpg': [3984, 2570],
    '/images/024.webp': [2000, 1500],
    '/images/025.webp': [1141, 899],
    '/images/010.jpg': [1512, 1512], // shown square
    '/images/014.jpg': [2016, 1512],
    '/images/020.jpg': [1940, 1455],
    '/images/016.jpg': [2016, 1512],
    '/images/018.jpg': [1943, 1458],
    '/images/026.webp': [1320, 904],
  } as Record<string, [number, number]>

  return <Masonry images={images} sizes={sizes} />
}
