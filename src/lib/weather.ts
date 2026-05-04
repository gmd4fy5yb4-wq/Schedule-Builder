/** Weather data for a single day */
export interface DayWeather {
  tempHigh: number      // °F, rounded
  tempLow: number       // °F, rounded
  precipChance: number  // 0–100
  weatherCode: number   // WMO code
  windSpeed: number     // mph, rounded
}

/** Maps a WMO weather interpretation code to an emoji. */
export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2)  return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}

/** Short description for a WMO weather code. */
export function weatherDesc(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2)  return 'Partly Cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow Showers'
  return 'Thunderstorm'
}

/**
 * Geocode a field location via the app's /api/geocode proxy.
 * Pass `address` (street address) and optionally `location` (venue/park name).
 * The proxy tries multiple sources with a city-extraction fallback.
 */
export async function geocodeField(
  address: string,
  location?: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const params = new URLSearchParams()
    if (address)  params.set('address',  address)
    if (location) params.set('location', location)
    const res = await fetch(`/api/geocode?${params}`)
    if (!res.ok) return null
    const data: { lat: number | null; lon: number | null } = await res.json()
    if (data.lat == null || data.lon == null) return null
    return { lat: data.lat, lon: data.lon }
  } catch {
    return null
  }
}

/**
 * Fetch a 14-day daily forecast from Open-Meteo (free, no key, CORS-friendly).
 * Returns a map of "YYYY-MM-DD" → DayWeather.
 */
export async function fetchDailyWeather(
  lat: number,
  lon: number,
): Promise<Map<string, DayWeather>> {
  try {
    const params = new URLSearchParams({
      latitude:         lat.toFixed(4),
      longitude:        lon.toFixed(4),
      daily:            [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
        'wind_speed_10m_max',
      ].join(','),
      temperature_unit: 'fahrenheit',
      wind_speed_unit:  'mph',
      timezone:         'auto',
      forecast_days:    '14',
    })
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!res.ok) return new Map()
    const json = await res.json()
    const {
      time,
      weather_code,
      temperature_2m_max,
      temperature_2m_min,
      precipitation_probability_max,
      wind_speed_10m_max,
    } = json.daily as {
      time: string[]
      weather_code: number[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      precipitation_probability_max: (number | null)[]
      wind_speed_10m_max: (number | null)[]
    }
    const map = new Map<string, DayWeather>()
    for (let i = 0; i < time.length; i++) {
      map.set(time[i], {
        weatherCode:  weather_code[i] ?? 0,
        tempHigh:     Math.round(temperature_2m_max[i] ?? 0),
        tempLow:      Math.round(temperature_2m_min[i] ?? 0),
        precipChance: precipitation_probability_max[i] ?? 0,
        windSpeed:    Math.round(wind_speed_10m_max[i] ?? 0),
      })
    }
    return map
  } catch {
    return new Map()
  }
}
