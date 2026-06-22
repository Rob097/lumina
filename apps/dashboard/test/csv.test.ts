import { describe, expect, it } from 'vitest';
import { parseProductsCsv } from '../src/lib/csv';

describe('parseProductsCsv', () => {
  it('parses a well-formed file with the canonical headers', () => {
    const csv = [
      'name,imageUrl,category,externalId',
      'Aura Floor Lamp,https://shop.it/aura.png,lighting,AURA-01',
      'Nube Sofa,https://shop.it/nube.png,furniture,NUBE-02',
    ].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Aura Floor Lamp',
      imageUrl: 'https://shop.it/aura.png',
      category: 'lighting',
      externalId: 'AURA-01',
    });
  });

  it('accepts header aliases (sku, image, image_url)', () => {
    const csv = ['sku,name,image', 'A1,Lamp,https://s.it/a.png'].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({ externalId: 'A1', name: 'Lamp', imageUrl: 'https://s.it/a.png' });
  });

  it('honors quoted fields containing commas', () => {
    const csv = ['name,imageUrl', '"Sofa, three-seat",https://s.it/sofa.png'].join('\n');
    const { rows } = parseProductsCsv(csv);
    expect(rows[0]?.name).toBe('Sofa, three-seat');
  });

  it('defaults category to "other" when omitted', () => {
    const csv = ['name,imageUrl', 'Lamp,https://s.it/a.png'].join('\n');
    expect(parseProductsCsv(csv).rows[0]?.category).toBe('other');
  });

  it('reports an error (with line number) for a missing required field', () => {
    const csv = ['name,imageUrl', 'No Image,'].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]?.line).toBe(2);
  });

  it('reports an error for an invalid category', () => {
    const csv = ['name,imageUrl,category', 'Lamp,https://s.it/a.png,banana'].join('\n');
    const { errors } = parseProductsCsv(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/category/i);
  });

  it('ignores blank lines and tolerates CRLF', () => {
    const csv = 'name,imageUrl\r\nLamp,https://s.it/a.png\r\n\r\n';
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(0);
  });

  it('errors when a required column is absent from the header', () => {
    const csv = ['name,category', 'Lamp,lighting'].join('\n');
    const { rows, errors } = parseProductsCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]?.message).toMatch(/imageUrl|image/i);
  });

  describe('dimensions', () => {
    it('parses width/height/depth/unit into a dimensions object', () => {
      const csv = [
        'name,imageUrl,width,height,depth,unit',
        'Nube Sofa,https://s.it/n.png,200,85,90,cm',
      ].join('\n');
      const { rows, errors } = parseProductsCsv(csv);
      expect(errors).toHaveLength(0);
      expect(rows[0]?.dimensions).toEqual({ w: 200, h: 85, d: 90, unit: 'cm' });
    });

    it('accepts the short w/h/d header aliases', () => {
      const csv = ['name,imageUrl,w,h,d,unit', 'Lamp,https://s.it/a.png,30,150,30,in'].join('\n');
      const { rows, errors } = parseProductsCsv(csv);
      expect(errors).toHaveLength(0);
      expect(rows[0]?.dimensions).toEqual({ w: 30, h: 150, d: 30, unit: 'in' });
    });

    it('defaults the unit to cm when a dimension is given without a unit', () => {
      const csv = ['name,imageUrl,width', 'Lamp,https://s.it/a.png,42'].join('\n');
      const { rows, errors } = parseProductsCsv(csv);
      expect(errors).toHaveLength(0);
      expect(rows[0]?.dimensions).toEqual({ w: 42, unit: 'cm' });
    });

    it('leaves dimensions undefined when no dimension columns are present', () => {
      const csv = ['name,imageUrl', 'Lamp,https://s.it/a.png'].join('\n');
      expect(parseProductsCsv(csv).rows[0]?.dimensions).toBeUndefined();
    });

    it('leaves dimensions undefined when only a unit (no measurement) is given', () => {
      const csv = ['name,imageUrl,unit', 'Lamp,https://s.it/a.png,cm'].join('\n');
      const { rows, errors } = parseProductsCsv(csv);
      expect(errors).toHaveLength(0);
      expect(rows[0]?.dimensions).toBeUndefined();
    });

    it('reports a per-line error for a non-positive dimension', () => {
      const csv = ['name,imageUrl,width', 'Lamp,https://s.it/a.png,-5'].join('\n');
      const { rows, errors } = parseProductsCsv(csv);
      expect(rows).toHaveLength(0);
      expect(errors[0]?.line).toBe(2);
      expect(errors[0]?.message).toMatch(/dimensions/i);
    });

    it('reports a per-line error for a non-numeric dimension', () => {
      const csv = ['name,imageUrl,height', 'Lamp,https://s.it/a.png,tall'].join('\n');
      const { rows, errors } = parseProductsCsv(csv);
      expect(rows).toHaveLength(0);
      expect(errors[0]?.message).toMatch(/dimensions/i);
    });
  });
});
