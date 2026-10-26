/**
 * src/services/google.js
 * ---------------------------------------------------------------------
 * Verificação do "ID token" do Login com Google (Google Identity Services).
 *
 * Fluxo: o botão do Google (no navegador) devolve uma "credential" — um JWT
 * assinado pelo Google. O navegador NUNCA é confiável: o servidor confere a
 * assinatura, o público (nosso Client ID), o emissor e a validade usando a
 * biblioteca oficial google-auth-library. Só depois disso o e-mail é aceito.
 *
 * Sem GOOGLE_CLIENT_ID no .env o recurso fica desligado e o botão nem aparece.
 * --------------------------------------------------------------------- */

import { OAuth2Client } from 'google-auth-library';

const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const cliente = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;

export const googleClientId = () => CLIENT_ID || null;
export const googleConfigurado = () => cliente !== null;

/** Valida a credential e devolve o perfil: { sub, email, emailVerificado, nome }. Lança erro se inválida. */
export async function verificarCredencialGoogle(credential) {
  const ticket = await cliente.verifyIdToken({ idToken: credential, audience: CLIENT_ID });
  const p = ticket.getPayload();
  return {
    sub: p.sub,
    email: p.email,
    emailVerificado: p.email_verified === true,
    nome: p.name || p.email,
  };
}
