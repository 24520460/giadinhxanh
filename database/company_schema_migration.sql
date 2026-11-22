-- =====================================================================
-- GIA ĐÌNH XANH — COMPANY ROLE & SUPPORT IMAGE SCHEMA MIGRATION (PART 4)
-- =====================================================================

-- 1. Tạo bảng company_profiles
CREATE TABLE IF NOT EXISTS public.company_profiles (
  company_id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  company_name VARCHAR(200) NOT NULL,
  tax_code VARCHAR(50) NOT NULL UNIQUE,
  address TEXT NOT NULL,
  ward_id VARCHAR(8) REFERENCES public.ward(ward_id),
  phone_number VARCHAR(20),
  description TEXT,
  logo_url TEXT,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'banned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Cập nhật bảng users cho phép role 'company'
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'provider', 'company', 'admin'));

-- 3. Cập nhật bảng provider_profiles gắn company_id
ALTER TABLE public.provider_profiles
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES public.company_profiles(company_id) ON DELETE SET NULL;

-- 4. Cập nhật bảng services gắn company_id (chuyển quyền quản lý dịch vụ cho Company)
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES public.company_profiles(company_id) ON DELETE CASCADE;

-- 5. Cập nhật bảng bookings gắn company_id
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES public.company_profiles(company_id) ON DELETE SET NULL;

-- 6. Cập nhật bảng support_tickets bổ sung hình ảnh minh chứng
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;
