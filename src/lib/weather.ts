/** Weather data for a single day */
export interface DayWeather {
  tempHigh: number      // °F, rounded
  tempLow: number       // °F, rounded
  precipChance: number  // 0–100
  weatherCode: number   // WMO code
}

/** Maps a WMO weather interpretation code to an emoji. */
export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2)  return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'   // fog
  if (code <= 57) return '🌦️'   // drizzle
  if (code <= 67) return '🌧️'   // rain
  if (code <= 77) return '❄️'   // snow
  if (code <= 82) return '🌦️'   // showers
  if (code <= 86) return '🌨️'   // snow showers
  return '⛈️'                   // thunderstorm
}

/** Short description for a WMO weather code (used in aria-label). */
export function weatherDesc(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 2)  return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 57) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow showers'
  return 'Thunderstorm'
}

/**
 * Geocode a street address using OpenStreetMap Nominatim (free, no key).
 * Browsers automatically send the page URL as Referer, satisfying Nominatim's
 * usage policy. Results should be cached by the caller (≤ 1 req/sec limit).
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=json&limit=1&q=${encodeURIComponent(address)}`
    const res = await fetch(url, { headers: { 'Accept-Language': 'en-US,en' } })
    if (!res.ok) return null
    const data: Array<{ lat: string; lon: string }> = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
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
      daily:            'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit: 'fahrenheit',
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
    } = json.daily as {
      time: string[]
      weather_code: number[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      precipitation_probability_max: (number | null)[]
    }
    const map = new Map<string, DayWeather>()
    for (let i = 0; i < time.length; i++) {
      map.set(time[i], {
        weatherCode:  weather_code[i] ?? 0,
        tempHigh:     Math.round(temperature_2m_max[i] ?? 0),
        tempLow:      Math.round(temperature_2m_min[i] ?? 0),
        precipChance: precipitation_probability_max[i] ?? 0,
      })
    }
    return map
  } catch {
    return new Map()
  }
}
