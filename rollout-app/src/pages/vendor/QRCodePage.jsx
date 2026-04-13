import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { useAuth } from '../../contexts/AuthContext'
import { Copy, Check, Download, FileText } from 'lucide-react'

const QR_SIZE = 280  // canvas pixels

export function QRCodePage() {
  const { vendor } = useAuth()
  const canvasRef  = useRef(null)
  const [copied, setCopied] = useState(false)

  const publicUrl = vendor
    ? `${window.location.origin}/${vendor.slug}`
    : ''

  // Render QR code onto canvas whenever URL is ready
  useEffect(() => {
    if (!publicUrl || !canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, publicUrl, {
      width:  QR_SIZE,
      margin: 2,
      color:  { dark: '#1a1a1a', light: '#ffffff' },
    })
  }, [publicUrl])

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadPNG() {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${vendor.slug}-qr.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  function downloadPDF() {
    const canvas = canvasRef.current
    if (!canvas) return

    const imgData  = canvas.toDataURL('image/png')
    const pdf      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW    = pdf.internal.pageSize.getWidth()
    const pageH    = pdf.internal.pageSize.getHeight()

    // Header
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(28)
    pdf.setTextColor(26, 26, 26)
    pdf.text(vendor.name ?? 'Find Us', pageW / 2, 32, { align: 'center' })

    if (vendor.description) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(12)
      pdf.setTextColor(100, 100, 100)
      const lines = pdf.splitTextToSize(vendor.description, pageW - 40)
      pdf.text(lines, pageW / 2, 42, { align: 'center' })
    }

    // QR code — centered
    const qrMM    = 90   // size in mm
    const qrX     = (pageW - qrMM) / 2
    const qrY     = 60
    pdf.addImage(imgData, 'PNG', qrX, qrY, qrMM, qrMM)

    // Instruction below QR
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.setTextColor(26, 26, 26)
    pdf.text('Scan for our schedule & location updates', pageW / 2, qrY + qrMM + 14, { align: 'center' })

    // URL
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(130, 130, 130)
    pdf.text(publicUrl, pageW / 2, qrY + qrMM + 22, { align: 'center' })

    // SMS CTA
    pdf.setDrawColor(229, 229, 227)
    pdf.setLineWidth(0.3)
    const boxY = qrY + qrMM + 34
    pdf.roundedRect(20, boxY, pageW - 40, 28, 3, 3)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(26, 26, 26)
    pdf.text('Want text alerts?', pageW / 2, boxY + 10, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.setTextColor(100, 100, 100)
    pdf.text('Scan the QR code and tap "Get location texts"', pageW / 2, boxY + 18, { align: 'center' })

    pdf.save(`${vendor.slug}-flyer.pdf`)
  }

  if (!vendor) return null

  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-2xl text-text-primary">QR Code</h1>
        <p className="text-text-secondary font-body text-sm mt-1">
          Share this code so customers can see your schedule and subscribe to location texts.
        </p>
      </div>

      {/* Card */}
      <div className="bg-surface border border-border rounded-2xl p-8 flex flex-col items-center gap-6">

        {/* QR canvas */}
        <div className="rounded-xl overflow-hidden border border-border shadow-sm">
          <canvas ref={canvasRef} />
        </div>

        {/* URL pill */}
        <div className="w-full flex items-center gap-2 bg-surface-raised border border-border rounded-xl px-4 py-3">
          <span className="flex-1 text-text-secondary font-body text-sm truncate">{publicUrl}</span>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 text-xs font-body font-medium text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
          >
            {copied
              ? <><Check size={13} className="text-success" /> Copied!</>
              : <><Copy size={13} /> Copy</>
            }
          </button>
        </div>

        {/* Download buttons */}
        <div className="w-full grid grid-cols-2 gap-3">
          <button
            onClick={downloadPNG}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-raised font-body font-medium text-sm text-text-primary transition-colors"
          >
            <Download size={15} />
            Download PNG
          </button>
          <button
            onClick={downloadPDF}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#1a1a1a] hover:bg-[#333] text-white font-body font-medium text-sm transition-colors"
          >
            <FileText size={15} />
            Download Flyer PDF
          </button>
        </div>
      </div>

      {/* How to use */}
      <div className="mt-6 bg-surface border border-border rounded-2xl p-6">
        <h2 className="font-display font-bold text-base text-text-primary mb-4">How to use</h2>
        <ol className="flex flex-col gap-3">
          {[
            { n: '1', text: 'Download the PNG to share digitally — post it on Instagram, your website, or text it to regulars.' },
            { n: '2', text: 'Download the Flyer PDF and print it. Tape it to your truck window or include it with orders.' },
            { n: '3', text: 'Customers scan the code, see your upcoming spots, and tap "Get location texts" to subscribe.' },
            { n: '4', text: 'When you go live from the sidebar, subscribers see a real-time banner with your current location.' },
          ].map(({ n, text }) => (
            <li key={n} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-accent-muted text-accent font-body font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                {n}
              </span>
              <p className="text-text-secondary font-body text-sm leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </div>

    </div>
  )
}
