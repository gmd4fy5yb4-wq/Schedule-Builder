'use client'
import { useState, useRef } from 'react'
import type { AppState } from '@/lib/types'
import { parseImportCSV, generateTemplate, ImportResult } from '@/lib/importCSV'
import { getSportConfig } from '@/lib/sports'

interface Props {
  state: AppState
  onImport: (result: ImportResult) => void
  onClose: () => void
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 10000)
}

export default function ImportModal({ state, onImport, onClose }: Props) {
  const sc = getSportConfig(state.season.sport)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    downloadBlob(generateTemplate(state.season.sport), 'fieldday-import-template.csv', 'text/csv;charset=utf-8;')
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setResult({ divisions: [], fields: [], umpires: [], errors: ['Please select a .csv file'], warnings: [] })
      setFileName(file.name)
      return
    }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => setResult(parseImportCSV(e.target?.result as string))
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const hasExistingData =
    state.divisions.some(d => d.teams.length > 0) ||
    state.fields.length > 0 ||
    state.umpires.length > 0

  const teamCount = result?.divisions.reduce((sum, d) => sum + d.teams.length, 0) ?? 0
  const totalRecords = (result?.divisions.length ?? 0) + (result?.fields.length ?? 0) + (result?.umpires.length ?? 0)
  const canImport = result && result.errors.length === 0 && totalRecords > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import League Data</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Import divisions, teams, {sc.venuePlural.toLowerCase()}, and {sc.officialPlural.toLowerCase()} from CSV
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none font-bold">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium text-blue-800">Need the template?</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Download a pre-filled CSV with example data and instructions
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="text-sm font-medium text-blue-700 border border-blue-300 rounded px-3 py-1.5 bg-white hover:bg-blue-50 transition whitespace-nowrap ml-4"
            >
              Download Template
            </button>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg px-4 py-10 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-[#cd163f] bg-red-50'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            {fileName ? (
              <p className="text-sm text-gray-700">
                <strong>{fileName}</strong> — click to change
              </p>
            ) : (
              <p className="text-sm text-gray-500">Drop your CSV file here, or click to browse</p>
            )}
            <p className="text-xs text-gray-400 mt-1">.csv files only</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
            />
          </div>

          {/* Results */}
          {result && (
            <>
              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-1">
                  <p className="text-sm font-semibold text-red-700">Cannot import — please fix:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}

              {/* Success summary */}
              {result.errors.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-green-800">Ready to import:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: 'Divisions', value: result.divisions.length },
                      { label: 'Teams', value: teamCount },
                      { label: sc.venuePlural, value: result.fields.length },
                      { label: sc.officialPlural, value: result.umpires.length },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between bg-white rounded px-3 py-2 border">
                        <span className="text-gray-500">{label}</span>
                        <span className={`font-bold ${value > 0 ? 'text-gray-800' : 'text-gray-300'}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-yellow-800 mb-1">
                    {result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}
                  </p>
                  <div className="max-h-28 overflow-y-auto space-y-0.5">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-700">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Overwrite warning */}
              {canImport && hasExistingData && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                  <p className="text-sm text-orange-800">
                    <strong>Heads up:</strong> This will replace your existing divisions, teams,{' '}
                    {sc.venuePlural.toLowerCase()}, and {sc.officialPlural.toLowerCase()}.
                    Your current schedule will not be affected.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end p-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border bg-white hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => canImport && onImport(result!)}
            disabled={!canImport}
            className="px-4 py-2 text-sm rounded bg-[#cd163f] text-white hover:bg-[#b01235] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {hasExistingData ? 'Replace & Import' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
