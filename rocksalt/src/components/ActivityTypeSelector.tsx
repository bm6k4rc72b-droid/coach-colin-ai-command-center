import { useTranslation } from 'react-i18next'
import { Car, User, Shield, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityType } from '@/types'

interface ActivityTypeSelectorProps {
  value: ActivityType | null
  onChange: (value: ActivityType) => void
  required?: boolean
}

const activityTypes: {
  value: ActivityType
  icon: typeof Car
  labelKey: string
}[] = [
  { value: 'vehicle', icon: Car, labelKey: 'vehicle' },
  { value: 'on_foot', icon: User, labelKey: 'on_foot' },
  { value: 'checkpoint', icon: Shield, labelKey: 'checkpoint' },
  { value: 'raid', icon: Home, labelKey: 'raid' },
]

export function ActivityTypeSelector({ value, onChange }: ActivityTypeSelectorProps) {
  const { t } = useTranslation()

  const handleClick = (activityValue: ActivityType) => {
    onChange(activityValue)
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {activityTypes.map((activity) => {
        const Icon = activity.icon
        const isSelected = value === activity.value
        return (
          <button
            key={activity.value}
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleClick(activity.value)
            }}
            onMouseDown={(e) => {
              // Prevent focus on mouse down to avoid focus tracking issues
              e.preventDefault()
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all',
              isSelected
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/50'
            )}
          >
            <Icon className={cn('h-8 w-8', isSelected ? 'text-primary' : 'text-muted-foreground')} />
            <span
              className={cn(
                'text-sm font-medium',
                isSelected ? 'text-primary' : 'text-foreground'
              )}
            >
              {t(`activity.${activity.labelKey}`)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

