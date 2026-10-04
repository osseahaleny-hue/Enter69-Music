import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const songId = String(body.songId || '');
    const pin = String(body.pin || '');
    const purpose = String(body.purpose || 'listen');

    if (!songId) throw new Error('Música não especificada.');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: song, error } = await supabase
      .from('songs')
      .select('id, file_path, cover_path, pin_salt, pin_hash')
      .eq('id', songId)
      .single();

    if (error || !song) throw new Error('Música não encontrada.');

    if (purpose === 'cover') {
      if (!song.cover_path) {
        return new Response(JSON.stringify({ url: '' }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const { data: signed, error: signError } =
        await supabase.storage
          .from('covers')
          .createSignedUrl(song.cover_path, 600);

      if (signError || !signed?.signedUrl) {
        throw new Error('Não foi possível carregar a capa.');
      }

      return new Response(JSON.stringify({ url: signed.signedUrl }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    if (!/^[0-9]{4}$/.test(pin)) {
      throw new Error('PIN inválido.');
    }

    const hash = await sha256(`${song.pin_salt}:${pin}`);

    if (hash !== song.pin_hash) {
      throw new Error('PIN incorreto.');
    }

    const expiresIn = purpose === 'download' ? 60 : 300;
    const options = purpose === 'download' ? { download: true } : undefined;

    const { data: signed, error: signError } =
      await supabase.storage
        .from('music')
        .createSignedUrl(song.file_path, expiresIn, options);

    if (signError || !signed?.signedUrl) {
      throw new Error('Não foi possível autorizar o ficheiro.');
    }

    return new Response(JSON.stringify({
      url: signed.signedUrl,
      purpose
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : 'Erro de autorização.'
    }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
