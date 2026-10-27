const redirects = {
  '/apply': 'https://airtable.com/appkHZ2UvU6SouT5y/pagGp5iw06B9Fc57g/form',
  '/submit-hack':
    'https://airtable.com/appNJwWpcxwIbW89F/pagQzXpkrwU7VMYzx/form',
  '/discord': 'https://discord.gg/jZHTRHUWy9',
  '/substack': 'https://moxsf.substack.com/',
  // '/people':
  //   'https://airtable.com/appkHZ2UvU6SouT5y/shrScGCEpYDJHG4m5/tbl3mg59vE4hyDveG',
  '/host-event':
    'https://airtable.com/appkHZ2UvU6SouT5y/pagHlAqA2JFG7nNP2/form',
  '/request': 'https://airtable.com/appkHZ2UvU6SouT5y/pagh2wfAVD2lItviY/form',
  '/feedback': 'https://airtable.com/appkHZ2UvU6SouT5y/pagnAzfmwXz1SvOID/form',
  '/fund':
    'https://moxsf.notion.site/Mox-Fund-for-massive-public-good-24e54492ea7a80a78e10d9dd9c149619',
  '/populi':
    'https://moxsf.notion.site/Mox-Populi-26954492ea7a80f7820ec2f5c237b212',
  '/guests': '/guest-program',
  '/guest': '/guest-program',
  '/expert': '/global-expert-fellowship',
  '/global-expert-fellowship': 'https://moxsf.notion.site/global-expert-fellowship?source=copy_link',
  '/onboard': 'https://airtable.com/appkHZ2UvU6SouT5y/pagS1zz7H3u2aoElF/form',
  '/membership': 'https://moxsf.notion.site/memberships',
  '/donate':
    'https://manifund.org/projects/mox-2026-fundraiser',
  '/hiring': 'https://moxsf.notion.site/interest',

  // Endpoints mostly for admin/staff
  '/eventz':
    'https://airtable.com/appkHZ2UvU6SouT5y/tblqzGMNypqO3jftS/viw1hb5Y019dA4NaL?blocks=hide',
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'v5.airtableusercontent.com',
      },
    ],
  },
  redirects: async () => {
    return Object.entries(redirects).map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }))
  },
  // Serve the task board at the tasks.moxsf.com root. Only the bare "/" is
  // rewritten, so /_next, /api and assets are untouched; deep links stay under
  // /tasks/* and resolve on the subdomain as tasks.moxsf.com/tasks/*.
  rewrites: async () => ({
    beforeFiles: [
      {
        source: '/',
        has: [{ type: 'host', value: 'tasks.moxsf.com' }],
        destination: '/tasks',
      },
    ],
  }),
}

module.exports = nextConfig
