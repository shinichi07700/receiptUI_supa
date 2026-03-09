// ============================================================
// Supabase Client Initialization
// ============================================================
// Single client used for both Auth and Data CRUD.
// Session persistence ensures that RLS policies work.
// ============================================================

var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// For backwards compatibility during migration
var supabaseAuth = supabase;

console.log('Supabase client initialized successfully');
