
export interface Client {
    id: string;
    user_id: string;
    type: 'INDIVIDUAL' | 'CORPORATE';
    name: string;
    tc_vk_no?: string;
    address?: string;
    phone?: string;
    email?: string;
    vekalet_pdf_url?: string;
    created_at: string;
}
