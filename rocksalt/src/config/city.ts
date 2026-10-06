// Oklahoma state configuration
export const cityConfig = {
  name: import.meta.env.VITE_CITY_NAME || 'Oklahoma',
  slug: import.meta.env.VITE_CITY_SLUG || 'ok',
  bounds: {
    // Oklahoma state bounds: SW corner (panhandle) to NE corner (Missouri border)
    sw: (import.meta.env.VITE_BOUNDS_SW || '33.6,-103.0')
      .split(',')
      .map(Number) as [number, number],
    ne: (import.meta.env.VITE_BOUNDS_NE || '37.0,-94.4')
      .split(',')
      .map(Number) as [number, number],
  },
  defaultCenter: (import.meta.env.VITE_DEFAULT_CENTER || '35.4676,-97.5164')
    .split(',')
    .map(Number) as [number, number],
  defaultZoom: Number(import.meta.env.VITE_DEFAULT_ZOOM) || 8,
  resources: [
    {
      name: 'ACLU Know Your Rights',
      url: 'https://www.aclu.org/know-your-rights/immigrants-rights',
    },
    {
      name: 'National Immigrant Justice Center',
      phone: '312-660-1370',
      url: 'https://immigrantjustice.org',
    },
  ],
}

