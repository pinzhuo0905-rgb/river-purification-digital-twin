import { render, screen } from '@testing-library/react';
import App from './App';
import { test, expect } from 'vitest';

test('renders header title', () => {
  render(<App />);
  const elements = screen.getAllByText(/河流光催化净化/i);
  expect(elements.length).toBeGreaterThan(0);
});
