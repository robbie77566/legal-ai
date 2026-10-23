import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PacketCard, { PACKET_CONTENTS_LINE } from '@/components/counsel/PacketCard'

/**
 * U5-c — the packet card offers the download and nothing else (UPL review
 * 2026-10-23, P6, question 8): no client-letter checkbox, no template
 * switch, and the download URL carries no `clientLetter` or `wdtex` query.
 */
describe('<PacketCard />', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ sections: [] }) }) as Response))
  })

  it('shows the download with no letter option and no template switch', async () => {
    render(<PacketCard caseId="case_1" title="GW — Direct appeal" />)
    const link = await screen.findByTestId('packet-download')
    expect(link.getAttribute('href')).toMatch(/\/counsel\/matters\/case_1\/packet\.pdf$/)
    expect(link.getAttribute('href')).not.toMatch(/clientLetter|wdtex/)
    const card = screen.getByTestId('packet-card')
    expect(card.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(card.querySelectorAll('input, select')).toHaveLength(0)
    expect(card.textContent).not.toMatch(/client letter|Part A|certificate|47\.2/i)
    expect(card).toHaveTextContent(PACKET_CONTENTS_LINE)
    expect(PACKET_CONTENTS_LINE).toMatch(/tool statement/)
  })

  it('says the packet arrives later while packet.json is not there', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response))
    render(<PacketCard caseId="case_2" title="AB — Art. 11.07" />)
    await waitFor(() => expect(screen.getByTestId('packet-pending')).toBeInTheDocument())
    expect(screen.queryByTestId('packet-download')).toBeNull()
  })
})
