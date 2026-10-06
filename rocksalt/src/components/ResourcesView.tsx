import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cityConfig } from '@/config/city'
import { ExternalLink, Phone } from 'lucide-react'

export function ResourcesView() {
  const { t } = useTranslation()

  return (
    <div className="h-full w-full overflow-y-auto bg-white dark:bg-background pb-16">
      <div className="px-4 py-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-foreground">
            {t('resources.title')}
          </h1>
          <p className="text-gray-600 dark:text-muted-foreground">
            {t('resources.legal')}
          </p>
        </div>

        <div className="space-y-6">
          {/* Know Your Rights */}
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {t('resources.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-semibold mt-0.5">•</span>
                  <span>{t('resources.rights1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-semibold mt-0.5">•</span>
                  <span>{t('resources.rights2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-semibold mt-0.5">•</span>
                  <span>{t('resources.rights3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-semibold mt-0.5">•</span>
                  <span>{t('resources.rights4')}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Legal Resources */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{t('resources.legal')}</h3>
            {cityConfig.resources.map((resource, index) => (
              <Card key={index} className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">{resource.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {resource.phone && (
                    <a
                      href={`tel:${resource.phone}`}
                      className="flex items-center gap-2 text-primary hover:underline group"
                    >
                      <Phone className="h-4 w-4 group-hover:scale-110 transition-transform" />
                      <span className="text-sm font-medium">{resource.phone}</span>
                    </a>
                  )}
                  {resource.url && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="w-full"
                    >
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2"
                      >
                        Visit Website
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Disclaimer */}
          <Card className="bg-muted/30 border-muted">
            <CardContent className="pt-6">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Rocksalt - {cityConfig.name} is a community information-sharing tool. Reporting and
                viewing public activity is protected speech. This app does not
                provide legal advice. If you need legal help, contact an
                immigration attorney or one of the resources listed above.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

