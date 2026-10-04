# ENTER69 — versão final preparada para Supabase

## O que esta versão faz

- As músicas são publicadas no Supabase, não no navegador.
- Qualquer visitante vê as novas músicas.
- O administrador entra com email e palavra-passe do Supabase.
- MP3 e capas ficam em buckets privados.
- O PIN da música é guardado como hash.
- O visitante precisa do PIN para ouvir.
- O visitante precisa novamente do PIN para baixar.
- O leitor aparece quando a música começa: capa, título, artista, progresso, tempo, pausa e parar.
- A Edge Function gera URLs temporárias.

## Configuração já preenchida

`config.js` já contém o Project URL e a Publishable Key fornecidos pelo proprietário do projeto.

Nunca coloque uma `service_role`/secret key no frontend.

## Para o projeto Supabase que já está configurado

1. Abra **SQL Editor**.
2. Abra `security-fix.sql`.
3. Execute o conteúdo uma vez.
   - Isso remove a política pública da tabela `songs` que exporia `pin_hash`.
   - Mantém o catálogo público somente através da view `public_songs`.
4. Confirme que a Edge Function `authorize-song` está publicada.
5. No Storage, mantenha `music` e `covers` privados.

## Edge Function

O arquivo está em:

`supabase/functions/authorize-song/index.ts`

A função precisa estar publicada como:

`authorize-song`

O ambiente da Edge Function usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` fornecidos pelo Supabase. Não copie a service role para o site.

## GitHub Pages

Publique o conteúdo da pasta `enter69/` no repositório `Enter69-Musicas`.

Na raiz publicada devem ficar:

- `index.html`
- `style.css`
- `app.js`
- `config.js`

A pasta `supabase/` e os SQLs podem ficar no repositório para referência, embora não sejam necessários para o navegador.

## Fluxo

Administrador:
Entrar → Adicionar música → enviar MP3/capa → escolher PIN → publicar.

Visitante:
Abrir site → ver música → clicar Ouvir → digitar PIN → leitor toca.

Download:
Clicar Baixar → digitar PIN → URL temporária → download.

## Observação de segurança

Um MP3 que é entregue ao navegador para reprodução não pode ser protegido contra captura por DRM apenas com JavaScript. O PIN protege o acesso normal e o download, mas não é DRM absoluto.


## Correção de upload do administrador

Para o projeto que já está configurado, execute novamente `security-fix.sql`.
A versão corrigida cria `public.is_enter69_admin()` como `SECURITY DEFINER`,
concede execução ao papel `authenticated` e recria as políticas de escrita
da tabela `songs` e dos buckets privados `music` e `covers`.

O navegador também confirma essa função antes do upload e mostra o erro
real do Supabase caso a publicação falhe.
