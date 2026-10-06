import { useTranslation } from 'react-i18next'
import { Map, Plus, Bell, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  activeTab: 'map' | 'report' | 'alerts' | 'resources'
  onTabChange: (tab: 'map' | 'report' | 'alerts' | 'resources') => void
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useTranslation()

  const tabs = [
    { id: 'map' as const, icon: Map, label: t('nav.map') },
    { id: 'report' as const, icon: Plus, label: t('nav.report') },
    { id: 'alerts' as const, icon: Bell, label: t('nav.alerts') },
    { id: 'resources' as const, icon: BookOpen, label: t('nav.resources') },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-background border-t border-gray-200 dark:border-border">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                isActive
                  ? 'text-blue-600 dark:text-primary'
                  : 'text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground'
              )}
              aria-label={tab.label}
            >
              <Icon className={cn('h-5 w-5', isActive && 'scale-110')} />
              <span className={cn('text-xs font-medium', isActive && 'font-semibold')}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

