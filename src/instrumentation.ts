// Next.js llama a register() una vez al arrancar el servidor.
// La revisión automática de correo solo corre en el runtime de Node
// (el import condicional evita que las librerías de correo entren al build de edge).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMailScheduler } = await import("./instrumentation-node");
    startMailScheduler();
  }
}
