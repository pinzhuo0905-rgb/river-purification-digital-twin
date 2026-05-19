import { render, screen } from '@testing-library/react';
import App from './App';
import { test, expect } from 'vitest';

test('renders dashboard title', () => {
  render(<App />);
  expect(screen.getByText(/河流光催化净化仿真/i)).toBeDefined();
});
