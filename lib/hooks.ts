import { useState, useCallback } from 'react'

export function useAsyncAction<T extends (...args: any[]) => Promise<any>>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const execute = useCallback(async (
    action: T,
    ...args: Parameters<T>
  ): Promise<ReturnType<T> | undefined> => {
    setLoading(true)
    setError('')
    try {
      const result = await action(...args)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return undefined
    } finally {
      setLoading(false)
    }
  }, [])

  return { execute, loading, error, setError }
}