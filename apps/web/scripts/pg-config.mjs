// Build node-postgres options from DATABASE_URL, following libpq's sslmode meanings:
//   disable / absent -> no TLS
//   require          -> TLS, certificate not verified (libpq behaviour), unless
//                       DATABASE_CA_CERT is set, in which case it is verified
//   verify-ca / verify-full -> TLS, verified against DATABASE_CA_CERT or system CAs
// Hosted providers such as Aiven give a CA certificate: set DATABASE_CA_CERT to its
// PEM text to verify the server.
export function poolConfig(url, extra = {}) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  for (const k of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) u.searchParams.delete(k);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  let ssl = false;
  if (mode && mode !== "disable" && mode !== "allow" && mode !== "prefer") {
    ssl = ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: mode !== "require" };
  }
  return { connectionString: u.toString(), ssl, ...extra };
}
