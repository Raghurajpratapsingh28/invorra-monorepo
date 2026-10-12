import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './Shell';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../context/AuthContext';

const mockedAuth = vi.mocked(useAuth);

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<p>Login screen</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<p>Private dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('sends anonymous visitors to login', () => {
    mockedAuth.mockReturnValue({
      user: null,
      loading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
    });
    renderRoute();
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('renders the page for a signed-in user', () => {
    mockedAuth.mockReturnValue({
      user: {
        id: 'u',
        email: 'owner@nimbus.invorra',
        name: 'Owner',
        role: 'OWNER',
        organizationId: 'o',
        organization: { id: 'o', name: 'Nimbus', slug: 'nimbus-fmcg' },
      },
      loading: false,
      setUser: vi.fn(),
      logout: vi.fn(),
    });
    renderRoute();
    expect(screen.getByText('Private dashboard')).toBeInTheDocument();
  });
});
