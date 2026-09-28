import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dispute } from '../src/types';
import VerdictPanel from '../src/components/VerdictPanel';
import DisputeCard from '../src/components/DisputeCard';
import StatusPill from '../src/components/StatusPill';

const BASE: Dispute = {
  id: '7',
  host: '0x146e44881d35814ba582d265af5b97ef2695ec8e',
  guest: '0x037f58e33c1ec8fda272361e0aac1e31054a1cde',
  depositWei: 10_000_000_000_000_000_000n,
  hostEvidenceUrl: 'https://example.org/host',
  guestEvidenceUrl: 'https://example.org/guest',
  rulesUrl: 'https://example.org/rules',
  status: 'RESOLVED',
  hostShare: 40,
  guestShare: 60,
  rationale: 'The listing promised air conditioning.',
};

describe('VerdictPanel', () => {
  it('splits the bond by the consensus shares', () => {
    render(<VerdictPanel dispute={BASE} />);
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('6 GEN')).toBeTruthy();
    expect(screen.getByText('4 GEN')).toBeTruthy();
  });

  it('renders model-written rationale as text, never as markup', () => {
    const hostile = { ...BASE, rationale: '<img src=x onerror="alert(1)">owned' };
    const { container } = render(<VerdictPanel dispute={hostile} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">owned');
  });
});

describe('StatusPill', () => {
  it('counts how many sides have filed while a case is open', () => {
    render(<StatusPill dispute={{ ...BASE, status: 'OPEN', hostEvidenceUrl: '' }} />);
    expect(screen.getByText('Awaiting evidence 1/2')).toBeTruthy();
  });

  it('marks a case ready once both sides have filed', () => {
    render(<StatusPill dispute={{ ...BASE, status: 'OPEN' }} />);
    expect(screen.getByText('Ready for adjudication')).toBeTruthy();
  });

  it('marks a settled case resolved', () => {
    render(<StatusPill dispute={BASE} />);
    expect(screen.getByText('Resolved')).toBeTruthy();
  });
});

describe('DisputeCard', () => {
  it('links to the case route and shows the bond in GEN', () => {
    const { container } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DisputeCard dispute={BASE} />
      </MemoryRouter>,
    );

    expect(container.querySelector('a')?.getAttribute('href')).toBe('/dispute/7');
    expect(screen.getByText('10 GEN')).toBeTruthy();
    expect(screen.getByText('Case #7')).toBeTruthy();
  });
});
