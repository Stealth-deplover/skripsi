package main

import "strings"

// Konstanta role sistem analitik kesejahteraan mahasiswa UMCI.
// student    = mahasiswa pengguna utama
// dpa        = dosen pembimbing akademik (admin biasa, scope mahasiswa bimbingan)
// superadmin = kaprodi (akses administratif + analytics tingkat prodi)
// staff      = staf kampus pemroses laporan syarat UTS/UAS
const (
	RoleStudent    = "student"
	RoleDPA        = "dpa"
	RoleSuperadmin = "superadmin"
	RoleStaff      = "staff"
)

// normalizeRole menyamakan alias role lama dengan role kanonis:
// kaprodi->superadmin, dosen/admin->dpa, selain itu student.
func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case RoleSuperadmin, "kaprodi":
		return RoleSuperadmin
	case RoleDPA, "dosen", "admin":
		return RoleDPA
	case RoleStaff, "staf":
		return RoleStaff
	default:
		return RoleStudent
	}
}

func isValidRole(role string) bool {
	switch normalizeRole(role) {
	case RoleStudent, RoleDPA, RoleSuperadmin, RoleStaff:
		return true
	}
	return false
}

func isStudentRole(role string) bool {
	return normalizeRole(role) == RoleStudent
}

func isDpaRole(role string) bool {
	return normalizeRole(role) == RoleDPA
}

func isSuperadminRole(role string) bool {
	return normalizeRole(role) == RoleSuperadmin
}

func isStaffRole(role string) bool {
	return normalizeRole(role) == RoleStaff
}

// isAdminLevelRole mencakup dpa, superadmin, dan staff: bukan responden asesmen.
func isAdminLevelRole(role string) bool {
	return !isStudentRole(role)
}
