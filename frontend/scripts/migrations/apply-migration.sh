#!/bin/bash

# Script to apply Supabase migration
# This opens the Supabase SQL Editor where you can paste and run the migration

echo "🚀 Applying Supabase Migration"
echo ""
echo "📋 Migration file: supabase/migrations/20250128000000_add_missing_tables.sql"
echo ""
echo "To apply this migration:"
echo ""
echo "Option 1: Via Supabase Dashboard (Recommended)"
echo "  1. Open: https://supabase.com/dashboard/project/kgoxdiojhxefylulciui/sql/new"
echo "  2. Copy the contents of: supabase/migrations/20250128000000_add_missing_tables.sql"
echo "  3. Paste into the SQL Editor"
echo "  4. Click 'Run' button"
echo ""
echo "Option 2: Via CLI (if you have Supabase CLI installed)"
echo "  npx supabase db push --db-url 'postgresql://...'"
echo ""
echo "Opening migration file in your default editor..."
echo ""

# Try to open the file
if command -v open &> /dev/null; then
    open "supabase/migrations/20250128000000_add_missing_tables.sql"
elif command -v xdg-open &> /dev/null; then
    xdg-open "supabase/migrations/20250128000000_add_missing_tables.sql"
else
    echo "Please manually open: supabase/migrations/20250128000000_add_missing_tables.sql"
fi

# Also try to open the Supabase dashboard
if command -v open &> /dev/null; then
    echo "Opening Supabase Dashboard..."
    open "https://supabase.com/dashboard/project/kgoxdiojhxefylulciui/sql/new"
fi

echo ""
echo "✅ Migration SQL is ready to be applied!"
echo "   The SQL file has been opened in your editor."
echo "   Copy all contents and paste into the Supabase SQL Editor."


