// Announcements API - CRUD operations for announcements
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        // GET - Fetch all announcements (or active only with ?active=true)
        if (req.method === 'GET') {
            const activeOnly = req.query.active === 'true';

            let query = supabase
                .from('announcements')
                .select('*')
                .order('created_at', { ascending: false });

            if (activeOnly) {
                query = query
                    .eq('is_active', true)
                    .or('expires_at.is.null,expires_at.gte.' + new Date().toISOString());
            }

            const { data, error } = await query;

            if (error) throw error;

            return res.status(200).json({ announcements: data || [] });
        }

        // POST - Create new announcement
        if (req.method === 'POST') {
            const { title, content, type, is_active, show_on_login, expires_at } = req.body;

            if (!title || !content) {
                return res.status(400).json({ error: 'Title and content are required' });
            }

            const { data, error } = await supabase
                .from('announcements')
                .insert([{
                    title,
                    content,
                    type: type || 'info',
                    is_active: is_active !== false,
                    show_on_login: show_on_login || false,
                    expires_at: expires_at || null
                }])
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({ announcement: data });
        }

        // PUT - Update announcement
        if (req.method === 'PUT') {
            const { id, ...updates } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Announcement ID is required' });
            }

            const { data, error } = await supabase
                .from('announcements')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            return res.status(200).json({ announcement: data });
        }

        // DELETE - Delete announcement
        if (req.method === 'DELETE') {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Announcement ID is required' });
            }

            const { error } = await supabase
                .from('announcements')
                .delete()
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (error) {
        console.error('Announcements API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
