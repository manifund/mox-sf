import { redirect } from 'next/navigation'

// The renew page moved to /renew so it renders outside the portal layout
// (whose narrow monospace column squashed the pricing table).
export default function PortalRenewRedirect() {
  redirect('/renew')
}
