// Reelwire BullMQ worker — entry point.
// M1 stub. Full job wiring lands in M3.
import "dotenv/config";

async function main() {
  console.log("[reelwire-worker] M1 stub — job wiring lands in M3");
}

main().catch((err) => {
  console.error("[reelwire-worker] fatal:", err);
  process.exit(1);
});
