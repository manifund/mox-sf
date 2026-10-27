'use client'

import { useState, type ReactNode } from 'react'
import {
  MEMBERSHIP_TIERS,
  OFFICE_CONTACT_EMAIL,
  OFFICE_PER_PERSON_MONTHLY_CENTS,
  QUARTER_MONTHS,
  TRIAL_DAYS,
  formatDollars,
  monthlyPriceCents,
  quarterlySavingsPercent,
  type BillingInterval,
  type MembershipTierId,
} from '@/app/lib/membership-pricing'

// Columns of the comparison table: the two self-serve tiers plus offices,
// which are quoted by hand.
type ColumnId = MembershipTierId | 'office'

interface Column {
  id: ColumnId
  name: string
  popular?: boolean
}

const COLUMNS: Column[] = [
  { id: 'core', name: MEMBERSHIP_TIERS.core.name, popular: true },
  { id: 'resident', name: MEMBERSHIP_TIERS.resident.name },
  { id: 'office', name: 'Office' },
]

// Feature rows. `true` renders a check, `false` a dash, a string renders as-is.
type Cell = boolean | string
interface FeatureRow {
  label: string
  cells: Record<ColumnId, Cell>
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: 'Workspace',
    cells: {
      core: 'Shared desks',
      resident: 'Dedicated desk',
      office: 'Dedicated office',
    },
  },
  { label: '24/7 access', cells: { core: true, resident: true, office: true } },
  {
    label: 'Complimentary snacks & drinks',
    cells: { core: true, resident: true, office: true },
  },
  {
    label: 'Members-only dinners & events',
    cells: { core: true, resident: true, office: true },
  },
  {
    label: 'Guest passes',
    cells: { core: '1 / day', resident: '2 / day', office: '2 / day / pp' },
  },
  {
    label: 'Onsite storage',
    cells: {
      core: false,
      resident: 'Desk + monitor + storage',
      office: 'Desk + monitor + storage',
    },
  },
  {
    label: 'Package delivery & business address',
    cells: { core: false, resident: true, office: true },
  },
]

export interface MembershipPricingTableProps {
  /**
   * `apply`: buttons send prospective members to the application form.
   * `checkout`: buttons start a Stripe Checkout subscription with a free trial.
   */
  mode: 'apply' | 'checkout'
  /** Airtable People record id, passed to Stripe as client_reference_id. */
  clientReferenceId?: string | null
  /** Prefills the Checkout email field. */
  customerEmail?: string | null
}

export default function MembershipPricingTable({
  mode,
  clientReferenceId,
  customerEmail,
}: MembershipPricingTableProps) {
  const [interval, setInterval] = useState<BillingInterval>('quarterly')
  const [pendingTier, setPendingTier] = useState<MembershipTierId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout(tier: MembershipTierId) {
    setError(null)
    setPendingTier(tier)
    try {
      const res = await fetch('/api/membership-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          interval,
          clientReferenceId: clientReferenceId || undefined,
          email: customerEmail || undefined,
        }),
      })
      // A crashed route returns an HTML error page rather than JSON.
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data.url !== 'string') {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Could not start checkout'
        )
      }
      window.location.assign(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setPendingTier(null)
    }
  }

  const columnHeaders: Record<ColumnId, ReactNode> = {
    core: (
      <TierHeader
        tier="core"
        interval={interval}
        mode={mode}
        pending={pendingTier === 'core'}
        disabled={pendingTier !== null}
        onCheckout={() => startCheckout('core')}
      />
    ),
    resident: (
      <TierHeader
        tier="resident"
        interval={interval}
        mode={mode}
        pending={pendingTier === 'resident'}
        disabled={pendingTier !== null}
        onCheckout={() => startCheckout('resident')}
      />
    ),
    office: <OfficeHeader />,
  }

  const intervalPicker = (
    <IntervalPicker value={interval} onChange={setInterval} />
  )

  return (
    <div className="bg-brown-50 text-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Desktop: comparison grid */}
        <div className="hidden md:block border-t-2 border-gray-900">
          <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr]">
            <div className="px-5 pt-8 pb-6 flex flex-col justify-end gap-3">
              {intervalPicker}
              <p className="text-sm text-gray-500">
                {interval === 'quarterly'
                  ? 'Prices shown for quarterly plans'
                  : 'Prices shown for month-to-month plans'}
              </p>
            </div>
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                className={`px-6 pt-8 pb-6 flex flex-col ${
                  col.popular ? 'bg-brown-100' : ''
                }`}
              >
                <ColumnTitle column={col} />
                {columnHeaders[col.id]}
              </div>
            ))}

            {FEATURE_ROWS.map((row) => (
              <FeatureRowCells key={row.label} row={row} />
            ))}
          </div>
        </div>

        {/* Mobile: one card per tier */}
        <div className="md:hidden space-y-6">
          {intervalPicker}
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className={`border border-brown-200 p-5 ${
                col.popular ? 'bg-brown-100' : 'bg-white'
              }`}
            >
              <ColumnTitle column={col} />
              {columnHeaders[col.id]}
              <dl className="mt-5 divide-y divide-brown-200 border-t border-brown-200 text-sm">
                {FEATURE_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between gap-4 py-2.5"
                  >
                    <dt className="text-gray-600">{row.label}</dt>
                    <dd className="text-right">
                      <CellValue value={row.cells[col.id]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error} — email{' '}
            <a href={`mailto:${OFFICE_CONTACT_EMAIL}`} className="underline">
              {OFFICE_CONTACT_EMAIL}
            </a>{' '}
            and we&apos;ll sort it out.
          </p>
        )}

        <p className="mt-6 text-sm text-gray-500">
          Every membership starts with a {TRIAL_DAYS}-day free trial. Quarterly
          plans are billed every {QUARTER_MONTHS} months; month-to-month plans
          can be cancelled anytime.
        </p>
      </div>
    </div>
  )
}

function ColumnTitle({ column }: { column: Column }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-2xl font-display font-bold text-amber-900">
        {column.name}
      </h3>
      {column.popular && (
        <span className="text-[10px] font-semibold tracking-widest uppercase text-amber-800 border border-amber-800 rounded-full px-2 py-0.5">
          Popular
        </span>
      )}
    </div>
  )
}

function IntervalPicker({
  value,
  onChange,
}: {
  value: BillingInterval
  onChange: (v: BillingInterval) => void
}) {
  const options: { id: BillingInterval; label: string }[] = [
    { id: 'quarterly', label: 'Quarterly' },
    { id: 'monthly', label: 'Month to month' },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="inline-flex border border-amber-800 text-sm self-start"
    >
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 transition-colors ${
              active
                ? 'bg-amber-800 text-white'
                : 'text-amber-900 hover:bg-amber-100'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function TierHeader({
  tier: tierId,
  interval,
  mode,
  pending,
  disabled,
  onCheckout,
}: {
  tier: MembershipTierId
  interval: BillingInterval
  mode: 'apply' | 'checkout'
  pending: boolean
  disabled: boolean
  onCheckout: () => void
}) {
  const tier = MEMBERSHIP_TIERS[tierId]
  const savings = quarterlySavingsPercent(tier)
  const buttonClass =
    'inline-block w-full text-center px-5 py-2.5 font-semibold transition-colors'
  const primary = tierId === 'core'
  const buttonStyle = primary
    ? 'bg-amber-800 text-white hover:bg-amber-900 disabled:bg-amber-800/60'
    : 'border border-amber-800 text-amber-900 hover:bg-amber-800 hover:text-white disabled:opacity-60'

  return (
    <div className="flex flex-col grow">
      <Price cents={monthlyPriceCents(tier, interval)} unit="/mo" />
      {interval === 'quarterly' ? (
        <>
          <p className="text-sm text-gray-600 mt-1">
            {formatDollars(tier.monthlyCents)}/mo month to month
          </p>
          <p className="text-sm font-semibold text-amber-800 mt-1">
            Save {savings}% with {QUARTER_MONTHS} months
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mt-1">
            {formatDollars(tier.quarterlyMonthlyCents)}/mo with {QUARTER_MONTHS}{' '}
            months
          </p>
          <p className="text-sm font-semibold text-amber-800 mt-1">
            Cancel anytime
          </p>
        </>
      )}
      <div className="mt-5 pt-px grow flex flex-col justify-end">
        {mode === 'apply' ? (
          <a href="/apply" className={`${buttonClass} ${buttonStyle}`}>
            Apply for {tier.name}
          </a>
        ) : (
          <button
            type="button"
            onClick={onCheckout}
            disabled={disabled}
            className={`${buttonClass} ${buttonStyle}`}
          >
            {pending ? 'Redirecting…' : `Join as ${tier.name}`}
          </button>
        )}
      </div>
    </div>
  )
}

function OfficeHeader() {
  return (
    <div className="flex flex-col grow">
      <Price cents={OFFICE_PER_PERSON_MONTHLY_CENTS} unit="/mo/pp" />
      <p className="text-sm text-gray-600 mt-1">
        Discounts available for mission-aligned work
      </p>
      <div className="mt-5 grow flex flex-col justify-end">
        <a
          href={`mailto:${OFFICE_CONTACT_EMAIL}?subject=Private%20office%20at%20Mox`}
          className="inline-block w-full text-center px-5 py-2.5 font-semibold border border-amber-800 text-amber-900 hover:bg-amber-800 hover:text-white transition-colors"
        >
          Contact us
        </a>
      </div>
    </div>
  )
}

function Price({ cents, unit }: { cents: number; unit: string }) {
  return (
    <p className="flex items-baseline gap-1">
      <span className="text-4xl font-display text-gray-900">
        {formatDollars(cents)}
      </span>
      <span className="text-sm text-gray-500">{unit}</span>
    </p>
  )
}

function FeatureRowCells({ row }: { row: FeatureRow }) {
  return (
    <>
      <div className="px-5 py-4 border-t border-brown-200 text-sm text-gray-700">
        {row.label}
      </div>
      {COLUMNS.map((col) => (
        <div
          key={col.id}
          className={`px-6 py-4 border-t border-brown-200 text-sm ${
            col.popular ? 'bg-brown-100' : ''
          }`}
        >
          <CellValue value={row.cells[col.id]} />
        </div>
      ))}
    </>
  )
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <span className="text-amber-900" aria-label="Included">
        ✓
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="text-gray-300" aria-label="Not included">
        —
      </span>
    )
  }
  return <span className="text-gray-800">{value}</span>
}
