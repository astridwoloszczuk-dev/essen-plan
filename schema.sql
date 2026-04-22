-- Run in your Supabase SQL editor (same project as gurkerl-list)

CREATE TABLE meal_plan (
  id          uuid default gen_random_uuid() primary key,
  date        date not null,
  meal_type   text not null check (meal_type in ('lunch', 'dinner')),
  dish        text not null,
  cook_status text not null check (cook_status in ('scratch', 'defrost', 'soulkitchen', 'eating_out')),
  added_by    text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

ALTER TABLE meal_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON meal_plan FOR ALL USING (true) WITH CHECK (true);
ALTER publication supabase_realtime ADD TABLE meal_plan;
