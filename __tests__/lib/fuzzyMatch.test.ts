import { fuzzyMatch } from '@/lib/utils'

describe('fuzzyMatch', () => {
  describe('Exact matches', () => {
    it('should match exact strings', () => {
      expect(fuzzyMatch('The Beatles', 'The Beatles')).toBe(true)
      expect(fuzzyMatch('pizza', 'pizza')).toBe(true)
    })

    it('should match with different cases', () => {
      expect(fuzzyMatch('the beatles', 'The Beatles')).toBe(true)
      expect(fuzzyMatch('PIZZA', 'pizza')).toBe(true)
      expect(fuzzyMatch('Tom Brady', 'tom brady')).toBe(true)
      expect(fuzzyMatch('NeW YoRk YaNkEeS', 'New York Yankees')).toBe(true)
    })

    it('should match with extra spaces', () => {
      expect(fuzzyMatch('  The Beatles  ', 'The Beatles')).toBe(true)
      expect(fuzzyMatch('Tom   Brady', 'Tom Brady')).toBe(true)
    })
  })

  describe('Minor typos', () => {
    it('should match with single character typos', () => {
      // Missing character
      expect(fuzzyMatch('Beatls', 'Beatles')).toBe(true)
      expect(fuzzyMatch('Toma Brady', 'Tom Brady')).toBe(true)

      // Extra character
      expect(fuzzyMatch('Beeatles', 'Beatles')).toBe(true)
      expect(fuzzyMatch('pizzza', 'pizza')).toBe(true)

      // Wrong character
      expect(fuzzyMatch('Baatles', 'Beatles')).toBe(true)
      expect(fuzzyMatch('pizxa', 'pizza')).toBe(true)
    })

    it('should match common misspellings', () => {
      expect(fuzzyMatch('Cristiano Ronoldo', 'Cristiano Ronaldo')).toBe(true)
      expect(fuzzyMatch('Micheal Jordan', 'Michael Jordan')).toBe(true)
      expect(fuzzyMatch('Lebron James', 'LeBron James')).toBe(true)
      expect(fuzzyMatch('Macdonalds', 'McDonalds')).toBe(true)
    })

    it('should match with swapped adjacent characters', () => {
      expect(fuzzyMatch('Baetles', 'Beatles')).toBe(true)
      expect(fuzzyMatch('Mihcael Jordan', 'Michael Jordan')).toBe(true)
    })
  })

  describe('Sports names specific cases', () => {
    it('should match NFL players with typos', () => {
      expect(fuzzyMatch('patrick mahomes', 'Patrick Mahomes')).toBe(true)
      expect(fuzzyMatch('Patrik Mahomes', 'Patrick Mahomes')).toBe(true)
      expect(fuzzyMatch('Aaron Rogers', 'Aaron Rodgers')).toBe(true)
    })

    it('should match NBA players with typos', () => {
      expect(fuzzyMatch('Lebron', 'LeBron James')).toBe(true) // Partial match is OK with current threshold
      expect(fuzzyMatch('Steph Curry', 'Stephen Curry')).toBe(true)
      expect(fuzzyMatch('Gianis', 'Giannis Antetokounmpo')).toBe(true) // Fuzzy match finds partial
      expect(fuzzyMatch('Giannis Antetokoumpo', 'Giannis Antetokounmpo')).toBe(true)
    })

    it('should match European cities with typos', () => {
      expect(fuzzyMatch('Paaris', 'Paris')).toBe(true)
      expect(fuzzyMatch('Londen', 'London')).toBe(true)
      expect(fuzzyMatch('Barcalona', 'Barcelona')).toBe(true)
      expect(fuzzyMatch('Amstradam', 'Amsterdam')).toBe(true)
    })

    it('should match Olympic events with variations', () => {
      expect(fuzzyMatch('100m Sprint', '100 Meter Sprint')).toBe(false) // Too different with current threshold
      expect(fuzzyMatch('100 meter', '100 Meter Sprint')).toBe(true) // Partial match found
      expect(fuzzyMatch('Marathon', 'Marathon')).toBe(true)
      expect(fuzzyMatch('Marathin', 'Marathon')).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should not match completely different words', () => {
      expect(fuzzyMatch('apple', 'orange')).toBe(false)
      expect(fuzzyMatch('Tom Brady', 'Patrick Mahomes')).toBe(false)
      expect(fuzzyMatch('Paris', 'London')).toBe(false)
      expect(fuzzyMatch('Basketball', 'Soccer')).toBe(false)
    })

    it('should handle empty strings', () => {
      expect(fuzzyMatch('', 'test')).toBe(false)
      expect(fuzzyMatch('test', '')).toBe(false)
      expect(fuzzyMatch('', '')).toBe(false)
    })

    it('should handle null/undefined gracefully', () => {
      expect(fuzzyMatch(null as any, 'test')).toBe(false)
      expect(fuzzyMatch('test', null as any)).toBe(false)
      expect(fuzzyMatch(undefined as any, 'test')).toBe(false)
      expect(fuzzyMatch('test', undefined as any)).toBe(false)
    })

    it('should handle very short words', () => {
      expect(fuzzyMatch('Go', 'Go')).toBe(true)
      expect(fuzzyMatch('Gi', 'Go')).toBe(false) // 50% different
      expect(fuzzyMatch('GP', 'Go')).toBe(false) // 50% different
    })

    it('should not match if too many changes needed', () => {
      // These require too many edits relative to word length
      expect(fuzzyMatch('abc', 'xyz')).toBe(false)
      expect(fuzzyMatch('Beatles', 'Metallica')).toBe(false)
      expect(fuzzyMatch('Tom', 'Patrick')).toBe(false)
    })
  })

  describe('Threshold behavior', () => {
    it('should allow reasonable typos for longer words', () => {
      // Longer words can have more typos
      expect(fuzzyMatch('Giannis Antetokounmpo', 'Giannis Antetokounmpo')).toBe(true)
      expect(fuzzyMatch('Giannis Antetokoumpo', 'Giannis Antetokounmpo')).toBe(true) // 2 typos
      expect(fuzzyMatch('Gianis Antetokounpo', 'Giannis Antetokounmpo')).toBe(true) // 2-3 typos
    })

    it('should be stricter for short words', () => {
      expect(fuzzyMatch('dog', 'cat')).toBe(false) // All different
      expect(fuzzyMatch('dig', 'dog')).toBe(false) // 33% different
      expect(fuzzyMatch('abc', 'aec')).toBe(false) // 33% different
      expect(fuzzyMatch('ab', 'yz')).toBe(false) // Too different
    })
  })

  describe('Real game scenarios', () => {
    it('should handle music groups', () => {
      expect(fuzzyMatch('beetles', 'The Beatles')).toBe(true) // Close enough with fuzzy matching
      expect(fuzzyMatch('The Beetles', 'The Beatles')).toBe(true)
      expect(fuzzyMatch('queen', 'Queen')).toBe(true)
      expect(fuzzyMatch('Queeen', 'Queen')).toBe(true)
      expect(fuzzyMatch('Led Zeplin', 'Led Zeppelin')).toBe(true)
      expect(fuzzyMatch('Led Zepelin', 'Led Zeppelin')).toBe(true)
    })

    it('should handle tech companies', () => {
      expect(fuzzyMatch('google', 'Google')).toBe(true)
      expect(fuzzyMatch('Goggle', 'Google')).toBe(true)
      expect(fuzzyMatch('Microsodt', 'Microsoft')).toBe(true)
      expect(fuzzyMatch('Micro Soft', 'Microsoft')).toBe(true)
    })

    it('should handle car brands', () => {
      expect(fuzzyMatch('mercedes', 'Mercedes-Benz')).toBe(true) // Partial match acceptable
      expect(fuzzyMatch('Mercedes Benz', 'Mercedes-Benz')).toBe(true)
      expect(fuzzyMatch('Lamborgini', 'Lamborghini')).toBe(true)
      expect(fuzzyMatch('Farrari', 'Ferrari')).toBe(true)
    })
  })
})