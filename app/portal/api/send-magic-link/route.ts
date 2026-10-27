import { Resend } from 'resend'
import { isValidEmail, escapeAirtableString } from '@/app/lib/airtable-helpers'
import { findRecord, Tables } from '@/app/lib/airtable'
import { env } from '@/app/lib/env'
import { createMagicLink } from '@/app/lib/magic-link'

const resend = new Resend(env.RESEND_API_KEY)

interface PersonFields {
  Name?: string
  Email?: string
}

// Simple in-memory rate limiting (replace with Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(email: string): boolean {
  const now = Date.now()
  const limit = rateLimitMap.get(email)

  if (!limit || now > limit.resetAt) {
    // Reset: allow 3 requests per 15 minutes
    rateLimitMap.set(email, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return true
  }

  if (limit.count >= 3) {
    return false // Rate limit exceeded
  }

  limit.count++
  return true
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 })
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim()

    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Check rate limit
    if (!checkRateLimit(normalizedEmail)) {
      return Response.json(
        {
          error:
            'Too many requests. Please wait 15 minutes before trying again.',
        },
        { status: 429 }
      )
    }

    // Find user in Airtable by email
    const user = await findUserByEmail(normalizedEmail)

    if (!user) {
      // For security, don't reveal if user exists or not
      return Response.json({
        success: true,
        message:
          'If an account exists with that email, you will receive a login link.',
      })
    }

    // Get the base URL - use request URL in development, env var in production
    const requestUrl = new URL(request.url)
    const baseUrl = env.isDevelopment
      ? `${requestUrl.protocol}//${requestUrl.host}`
      : env.NEXT_PUBLIC_BASE_URL

    const magicLink = await createMagicLink(user.id, baseUrl)

    const emailResult = await resend.emails.send({
      from: 'Mox SF <noreply@account.moxsf.com>',
      to: normalizedEmail,
      subject: 'Your Mox SF Member Portal Login Link',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to the Mox SF Member Portal</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Click the link below to access your member portal:</p>
          <p style="margin: 30px 0;">
            <a href="${magicLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Access Your Portal
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
          </p>
          <p style="color: #666; font-size: 14px;">
            Or copy and paste this URL: ${magicLink}
          </p>
        </div>
      `,
    })

    if (emailResult.error) {
      throw new Error(`Login email rejected: ${emailResult.error.message}`)
    }

    return Response.json({
      success: true,
      message: 'Login link sent! Check your email.',
    })
  } catch (error) {
    console.error('Error sending magic link:', error)
    return Response.json(
      {
        error: 'Failed to send login link. Please try again.',
      },
      { status: 500 }
    )
  }
}

async function findUserByEmail(email: string) {
  // Use escapeAirtableString to prevent formula injection
  const escapedEmail = escapeAirtableString(email)
  const formula = `{Email} = '${escapedEmail}'`

  const record = await findRecord<PersonFields>(Tables.People, formula)

  if (!record) {
    return null
  }

  return {
    id: record.id,
    name: record.fields.Name,
    email: record.fields.Email,
  }
}

