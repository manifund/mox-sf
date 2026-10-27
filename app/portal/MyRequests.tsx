import { format } from 'date-fns'
import type { OperationsRequest } from './requests'

const STATUS_BADGE: Record<string, string> = {
  'In progress': 'paused',
  Done: 'confirmed',
  "Won't do": 'cancelled',
}

export default function MyRequests({
  requests,
  formUrl,
}: {
  requests: OperationsRequest[]
  formUrl: string
}) {
  return (
    <>
      <h2>tickets &amp; requests</h2>

      {requests.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>request</th>
              <th>submitted</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>
                  {request.summary}
                  {request.categories.length > 0 && (
                    <span className="muted">
                      {' '}
                      ({request.categories.join(', ').toLowerCase()})
                    </span>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {request.submittedAt
                    ? format(new Date(request.submittedAt), 'MMM d')
                    : ''}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[request.status] ?? ''}`}>
                    {request.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: requests.length > 0 ? '15px' : undefined }}>
        <a href={formUrl} target="_blank" rel="noopener noreferrer">
          submit a ticket
        </a>{' '}
        <span className="muted">
          — building issues, food &amp; drink, a/v, anything else
        </span>
      </p>
    </>
  )
}
