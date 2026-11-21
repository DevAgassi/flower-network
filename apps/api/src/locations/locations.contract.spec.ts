import {
  createLocationRequestSchema,
  updateLocationRequestSchema,
} from './locations.contract.js';

const store = {
  name: 'Podil',
  kind: 'store',
  address: 'Kontraktova sq. 1',
  latitude: 50.465,
  longitude: 30.515,
};

describe('location contract', () => {
  it('accepts a store with a weekly schedule, including 00:00–24:00', () => {
    const result = createLocationRequestSchema.safeParse({
      ...store,
      hours: [
        { weekday: 1, opens: '09:00', closes: '20:00' },
        { weekday: 7, opens: '00:00', closes: '24:00' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('defaults to no hours (every day off)', () => {
    expect(createLocationRequestSchema.parse(store).hours).toEqual([]);
  });

  it.each([
    ['weekday 0', { weekday: 0, opens: '09:00', closes: '20:00' }],
    ['weekday 8', { weekday: 8, opens: '09:00', closes: '20:00' }],
    ['opens at 24:00', { weekday: 1, opens: '24:00', closes: '24:00' }],
    ['not HH:MM', { weekday: 1, opens: '9:00', closes: '20:00' }],
    ['closes before opens', { weekday: 1, opens: '20:00', closes: '09:00' }],
    ['empty interval', { weekday: 1, opens: '09:00', closes: '09:00' }],
  ])('rejects hours with %s', (_name, hours) => {
    expect(
      createLocationRequestSchema.safeParse({ ...store, hours: [hours] })
        .success,
    ).toBe(false);
  });

  it('rejects the same weekday twice', () => {
    const day = { weekday: 3, opens: '09:00', closes: '13:00' };
    const result = createLocationRequestSchema.safeParse({
      ...store,
      hours: [day, { ...day, opens: '14:00', closes: '18:00' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects coordinates out of range', () => {
    expect(
      createLocationRequestSchema.safeParse({ ...store, latitude: 91 }).success,
    ).toBe(false);
    expect(
      createLocationRequestSchema.safeParse({ ...store, longitude: -181 })
        .success,
    ).toBe(false);
  });

  it('rejects an empty update', () => {
    expect(updateLocationRequestSchema.safeParse({}).success).toBe(false);
  });
});
