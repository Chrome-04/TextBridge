const LIMIT = 20_000_000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type FileRecord = {
  id: string
  name: string
  size: number
  state: string
  created_at: string
}
type Services = {
  rpc: <T>(name: string, input?: object) => Promise<T>
  storage: (
    path: string,
    init?: RequestInit,
    bucket?: string,
  ) => Promise<Response>
  readBody: (request: Request, max: number) => Promise<Uint8Array>
  jsonBody: (request: Request, max: number) => Promise<any>
  limit: (client: string, action: string, bytes?: number) => Promise<void>
  client: string
  owner: string
  headers: Headers
}
export async function cleanupSavedFiles(
  services: Pick<Services, 'rpc' | 'storage'>,
) {
  const ids = await services.rpc<string[]>('tb_files_cleanup')
  for (const id of ids) {
    await services.storage(
      '',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [id] }),
      },
      'textbridge-saved',
    )
    await services.rpc('tb_file_deleted', { p_id: id })
  }
  return ids.length
}
export async function savedFiles(
  request: Request,
  path: string,
  s: Services,
): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    Response.json(data, { status, headers: s.headers })
  const input = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
  if (path === '/files/list') {
    await s.limit(s.client, 'receive')
    const body = await s.jsonBody(request, 256)
    if (
      !input(body) ||
      Object.keys(body).some((key) => key !== 'offset') ||
      (body.offset !== undefined &&
        (!Number.isSafeInteger(body.offset) ||
          body.offset < 0 ||
          body.offset > 20_000_000))
    )
      return json({ error: 'invalid' }, 400)
    return json(
      await s.rpc('tb_files_list', {
        p_owner: s.owner,
        p_offset: body.offset ?? 0,
      }),
    )
  }
  if (path === '/files/upload') {
    await s.limit(s.client, 'create')
    const id = (request.headers.get('X-File-Id') || '').toLowerCase()
    let name = ''
    try {
      name = decodeURIComponent(request.headers.get('X-Share-Name') || '')
    } catch {
      return json({ error: 'invalid' }, 400)
    }
    name = name.replace(/[\/\\\x00-\x1f\x7f]/g, '_').trim()
    if (!uuid.test(id) || !name || name.length > 240)
      return json({ error: 'invalid' }, 400)
    const bytes = await s.readBody(request, LIMIT)
    if (!bytes.length) return json({ error: 'invalid' }, 400)
    await s.limit(s.client, 'upload', bytes.length)
    const state = await s.rpc<string>('tb_file_reserve', {
      p_owner: s.owner,
      p_id: id,
      p_name: name,
      p_size: bytes.length,
    })
    if (state === 'full') return json({ error: 'storage-full' }, 409)
    if (state === 'ready') return json({ id }, 200)
    if (state !== 'reserved') return json({ error: 'pending' }, 409)
    // Reservations count toward quota until Storage confirms removal. An uncertain
    // response never causes a committed file to be deleted by an upload retry.
    await s.storage(
      `/${id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
        },
        body: new Uint8Array(bytes).buffer,
      },
      'textbridge-saved',
    )
    if (!(await s.rpc('tb_file_ready', { p_owner: s.owner, p_id: id })))
      return json({ error: 'pending' }, 409)
    return json({ id }, 201)
  }
  if (path === '/files/download' || path === '/files/delete') {
    await s.limit(s.client, 'receive')
    const body = await s.jsonBody(request, 256)
    if (
      !input(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.id !== 'string' ||
      !uuid.test(body.id)
    )
      return json({ error: 'invalid' }, 400)
    const item = await s.rpc<FileRecord | null>('tb_file_lookup', {
      p_owner: s.owner,
      p_id: body.id,
      p_delete: path.endsWith('/delete'),
    })
    if (!item) return json({ error: 'not-found' }, 404)
    if (path.endsWith('/delete')) {
      if (item.state === 'pending') return json({ error: 'pending' }, 409)
      await s.storage(
        '',
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: [item.id] }),
        },
        'textbridge-saved',
      )
      await s.rpc('tb_file_deleted', { p_id: item.id })
      return json({ deleted: true })
    }
    await s.limit(s.client, 'download', item.size)
    const bytes = await (
      await s.storage(`/${item.id}`, {}, 'textbridge-saved')
    ).arrayBuffer()
    if (bytes.byteLength !== item.size)
      return json({ error: 'unavailable' }, 503)
    if (!(await s.rpc('tb_file_lookup', { p_owner: s.owner, p_id: item.id })))
      return json({ error: 'not-found' }, 404)
    s.headers.set('Content-Type', 'application/octet-stream')
    s.headers.set('Content-Disposition', 'attachment')
    return new Response(bytes, { headers: s.headers })
  }
  return json({ error: 'not-found' }, 404)
}
