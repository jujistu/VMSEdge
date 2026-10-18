import {
  assertTransition,
  assertWindow,
  csvCell,
  dayBounds,
  oid,
  schedule,
  VisitStatus,
  transitions,
} from '../src/common/domain';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvitationDto, VisitQueryDto } from '../src/common/dto';
describe('visit invariants', () => {
  for (const from of Object.values(VisitStatus))
    for (const to of Object.values(VisitStatus))
      it(`${from} -> ${to}`, () => {
        if (transitions[from]?.includes(to))
          expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow();
      });
  it('enforces inclusive early arrival and exclusive departure', () => {
    const visit = {
      expectedArrivalAt: new Date('2026-09-25T09:00:00Z'),
      expectedDepartureAt: new Date('2026-09-25T10:00:00Z'),
    };
    expect(() =>
      assertWindow(visit, new Date('2026-09-25T08:30:00Z')),
    ).not.toThrow();
    expect(() =>
      assertWindow(visit, new Date('2026-09-25T08:29:59Z')),
    ).toThrow();
    expect(() =>
      assertWindow(visit, new Date('2026-09-25T10:00:00Z')),
    ).toThrow();
  });
  it('uses Lagos day boundaries', () => {
    expect(
      dayBounds(new Date('2026-09-25T23:30:00Z')).start.toISOString(),
    ).toBe('2026-09-25T23:00:00.000Z');
  });
  it('rejects invalid schedules and identifiers', () => {
    expect(() => schedule('bad', 'bad')).toThrow();
    expect(() => schedule('2026-09-25', '2026-09-27')).toThrow();
    expect(() => oid('123')).toThrow();
  });
  it('escapes CSV and formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it('rejects injection and unknown query fields', async () => {
    const q = plainToInstance(VisitQueryDto, {
      hostId: { $ne: null },
      limit: 1000,
      bogus: 1,
    });
    expect(
      (await validate(q, { whitelist: true, forbidNonWhitelisted: true }))
        .length,
    ).toBeGreaterThan(0);
  });
  it('validates nested invitation data and explicit offsets', async () => {
    const q = plainToInstance(CreateInvitationDto, {
      visitor: { firstName: '' },
      purpose: 'Meeting',
      visitorType: 'BUSINESS',
      expectedArrivalAt: '2026-09-25T09:00',
      expectedDepartureAt: '2026-09-25T10:00',
    });
    expect((await validate(q)).length).toBeGreaterThan(0);
  });
});
