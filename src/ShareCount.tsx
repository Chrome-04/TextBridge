import { useEffect, useState } from 'react'
import { getShareStats, isLive, type ShareStats } from './share-client'

export default function ShareCount({
  refreshVersion,
}: {
  refreshVersion: number
}) {
  const [stats, setStats] = useState<ShareStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    void getShareStats()
      .then((value) => {
        if (active) setStats(value)
      })
      .catch(() => {
        if (active) setStats(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshVersion, retry])

  return (
    <div className="share-count" aria-busy={loading}>
      <p role="status">
        {!isLive && <span>Local test · </span>}
        {stats ? (
          <>
            <strong>
              {BigInt(stats.totalShares).toLocaleString()}{' '}
              {stats.totalShares === '1' ? 'share created' : 'shares created'}
            </strong>
            <span>
              {' '}
              · since{' '}
              <time dateTime={stats.startedAt}>
                {new Date(stats.startedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            </span>
          </>
        ) : loading ? (
          'Loading share count…'
        ) : (
          'Share count unavailable'
        )}
      </p>
      <button
        type="button"
        className="share-count-refresh"
        aria-label="Refresh share count"
        disabled={loading}
        onClick={() => setRetry((value) => value + 1)}
      >
        {loading ? 'Updating…' : 'Refresh'}
      </button>
    </div>
  )
}
