import { supabase } from '../../lib/supabase';
import { Client } from '../types';

export const clientService = {
    async getClients(): Promise<Client[]> {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('name');

        if (error) throw error;
        return data || [];
    },

    async getClient(id: string): Promise<Client | null> {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    async addClient(client: Omit<Client, 'id' | 'user_id' | 'created_at'>): Promise<Client> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Kullanıcı oturumu bulunamadı');

        const { data, error } = await supabase
            .from('clients')
            .insert([{ ...client, user_id: user.id }])
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateClient(id: string, updates: Partial<Client>): Promise<Client> {
        const { data, error } = await supabase
            .from('clients')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteClient(id: string): Promise<void> {
        // First get the client to check for PDF
        const client = await this.getClient(id);

        // Delete associated PDF if exists
        if (client?.vekalet_pdf_url) {
            await this.deleteVekaletPdf(id);
        }

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // Upload vekaletname PDF
    async uploadVekaletPdf(clientId: string, file: File): Promise<string> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Kullanıcı oturumu bulunamadı');

        // Create unique filename: userId/clientId/timestamp_filename.pdf
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${user.id}/${clientId}/${timestamp}_${safeName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
            .from('client-documents')
            .upload(filePath, file, {
                contentType: 'application/pdf',
                upsert: false
            });

        if (uploadError) throw uploadError;

        // Get public URL (signed URL for private bucket)
        const { data: urlData } = await supabase.storage
            .from('client-documents')
            .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry

        const pdfUrl = urlData?.signedUrl || filePath;

        // Update client with PDF URL (store path, not signed URL)
        await this.updateClient(clientId, { vekalet_pdf_url: filePath });

        return pdfUrl;
    },

    // Get signed URL for viewing PDF
    async getVekaletPdfUrl(filePath: string): Promise<string | null> {
        if (!filePath) return null;

        const { data, error } = await supabase.storage
            .from('client-documents')
            .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

        if (error) {
            console.error('Error getting signed URL:', error);
            return null;
        }

        return data?.signedUrl || null;
    },

    // Delete vekaletname PDF
    async deleteVekaletPdf(clientId: string): Promise<void> {
        const client = await this.getClient(clientId);
        if (!client?.vekalet_pdf_url) return;

        const { error } = await supabase.storage
            .from('client-documents')
            .remove([client.vekalet_pdf_url]);

        if (error) {
            console.error('Error deleting PDF:', error);
        }

        // Clear the URL from client record
        await this.updateClient(clientId, { vekalet_pdf_url: undefined });
    }
};
