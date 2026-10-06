import { useState, useEffect } from 'react'
import { MapView } from '@/components/MapView'
import { ReportForm } from '@/components/ReportForm'
import { AlertsView } from '@/components/AlertsView'
import { ResourcesView } from '@/components/ResourcesView'
import { BottomNav } from '@/components/BottomNav'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { cityConfig } from '@/config/city'
import { isDemoMode } from '@/lib/supabase'

function App() {
  const [activeTab, setActiveTab] = useState<'map' | 'report' | 'alerts' | 'resources'>('map')
  const [reportFormOpen, setReportFormOpen] = useState(false)

  // Set page title with state name
  useEffect(() => {
    document.title = `Rocksalt - ${cityConfig.name} - ICE Sightings`
  }, [])

  // Handle tab changes
  const handleTabChange = (tab: 'map' | 'report' | 'alerts' | 'resources') => {
    if (tab === 'report') {
      setActiveTab('report')
      setReportFormOpen(true)
    } else {
      setActiveTab(tab)
      setReportFormOpen(false)
    }
  }

  // If report form is open, show it; otherwise show active tab
  const showReportForm = reportFormOpen || activeTab === 'report'

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Minimal Header - Just title and language switcher */}
      <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-background border-b border-gray-200 dark:border-border z-40 shrink-0">
        <div className="flex items-center gap-3">
          <img 
            src={`${import.meta.env.BASE_URL}rocksalt.svg`} 
            alt="Rocksalt Logo" 
            className="h-8 w-8 flex-shrink-0 dark:invert"
          />
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-foreground">
            Rocksalt - {cityConfig.name}
          </h1>
        </div>
        <LanguageSwitcher />
      </header>

      {isDemoMode && (
        <div className="px-4 py-2 text-xs text-center bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 border-b border-amber-300 dark:border-amber-800 shrink-0">
          Demo mode: no database is connected, so reports stay on this device and are not shared.
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden pb-16">
        {showReportForm ? (
          <ReportForm
            open={reportFormOpen}
            onOpenChange={(open) => {
              setReportFormOpen(open)
              if (!open) {
                setActiveTab('map')
              }
            }}
            onSuccess={() => {
              setReportFormOpen(false)
              setActiveTab('map')
            }}
          />
        ) : activeTab === 'map' ? (
          <MapView />
        ) : activeTab === 'alerts' ? (
          <AlertsView />
        ) : activeTab === 'resources' ? (
          <ResourcesView />
        ) : null}
      </main>

      {/* Bottom Navigation */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  )
}

export default App
