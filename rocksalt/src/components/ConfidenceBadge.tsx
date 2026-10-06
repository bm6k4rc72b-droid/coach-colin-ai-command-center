import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { getConfidenceLevel, getConfidenceColorClass } from '@/lib/confidence'

interface ConfidenceBadgeProps {
  score: number
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  const { t } = useTranslation()
  const level = getConfidenceLevel(score)
  const colorClass = getConfidenceColorClass(level)

  return (
    <Badge variant="outline" className={colorClass}>
      {t('map.confidence')}: {score}
    </Badge>
  )
}

