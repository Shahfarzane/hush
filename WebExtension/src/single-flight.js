// Calls that arrive while one is running share its promise instead of
// starting their own: in Chrome every native read starts a host process.
export const singleFlight = (run) => {
  let running = null;
  return () =>
    running ??= run().finally(() => {
      running = null;
    });
};
