import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TimeFilterProps {
  hoursAgo: number
  onChange: (hours: number) => void
}

const timeOptions = [1, 2, 4, 8, 24]

export function TimeFilter({ hoursAgo, onChange }: TimeFilterProps) {
  const { t } = useTranslation()

  return (
    <div className="pt-2">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {timeOptions.map((hours) => (
          <Button
            key={hours}
            variant={hoursAgo === hours ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(hours)}
            className={cn(
              'whitespace-nowrap shrink-0',
              hoursAgo === hours && 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            {hours} {t('map.hours')}
          </Button>
        ))}
      </div>
    </div>
  )
}

