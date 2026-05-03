// Minecraft module — minimal post-Prism shim.
//
// Historical context: this file used to be the home of the Prism-based
// Minecraft pipeline (auto-install of Prism Launcher, modpack import via
// Prism's CLI, Prism `instance.cfg` patching, etc.). All of that was
// retired once the in-house native chain (`mc_native_*` commands in
// `mc_launch.rs` + `mc_vanilla.rs` + `mc_fabric.rs` + `mc_forge.rs` +
// `mc_zip.rs` + `mc_modrinth.rs`) became the only supported launch
// path. The module is kept around for two reasons :
//
//   1. The `McLaunchTracker` Tauri state struct is `.manage()`-d in
//      `lib.rs` to reserve the slot for future cross-launch tracking
//      features (Discord RPC playtime, "currently launched" UI). It's
//      currently a no-op holder — none of the existing commands write
//      to it — but removing it would force a churn in `lib.rs` for no
//      benefit while we still ship.
//   2. The historic state-file at
//      `<APPDATA>/Simple Launcher/minecraft/<moduleId>.json` may exist
//      on machines that ran the Prism era. We don't read it from the
//      frontend anymore, but we keep the path helper around so a future
//      one-shot cleanup pass can find and delete those orphans.
//
// If both of those needs disappear in a future cleanup, this whole
// module can be dropped along with its `mod minecraft;` declaration.

use std::collections::HashSet;
use std::sync::Arc;

use tokio::sync::Mutex as TokioMutex;

/// No-op launch tracker held in Tauri state. Kept as a state-shaped
/// placeholder so we can wire actual cross-launch tracking later without
/// reshuffling `.manage()` calls in `lib.rs`.
pub struct McLaunchTracker {
    #[allow(dead_code)]
    inner: Arc<TrackerInner>,
}
struct TrackerInner {
    #[allow(dead_code)]
    running: TokioMutex<HashSet<String>>,
}
impl McLaunchTracker {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(TrackerInner {
                running: TokioMutex::new(HashSet::new()),
            }),
        }
    }
}
