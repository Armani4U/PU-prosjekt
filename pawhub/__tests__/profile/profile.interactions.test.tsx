import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  signOutMock,
  updateUserMock,
  fromMock,
  profileSelectSingleMock,
  profileUpdateMock,
  profileUpdateEqMock,
  dogsOrderMock,
  dogsUpdateMock,
  dogsUpdateEqMock,
  dogsDeleteEqMock,
  storageFromMock,
  storageRemoveMock,
} = vi.hoisted(() => {
  const getUserMock = vi.fn();
  const signOutMock = vi.fn();
  const updateUserMock = vi.fn();

  const profileSelectSingleMock = vi.fn();
  const profileSelectEqMock = vi.fn(() => ({ single: profileSelectSingleMock }));
  const profileSelectMock = vi.fn(() => ({ eq: profileSelectEqMock }));

  const profileUpdateEqMock = vi.fn();
  const profileUpdateMock = vi.fn(() => ({ eq: profileUpdateEqMock }));

  const dogsOrderMock = vi.fn();
  const dogsSelectEqMock = vi.fn(() => ({ order: dogsOrderMock }));
  const dogsSelectMock = vi.fn(() => ({ eq: dogsSelectEqMock }));

  const dogsUpdateEqMock = vi.fn();
  const dogsUpdateMock = vi.fn(() => ({ eq: dogsUpdateEqMock }));
  const dogsInsertMock = vi.fn();
  const dogsDeleteEqMock = vi.fn();
  const dogsDeleteMock = vi.fn(() => ({ eq: dogsDeleteEqMock }));
  const storageRemoveMock = vi.fn();
  const storageUploadMock = vi.fn();
  const storageGetPublicUrlMock = vi.fn(() => ({ data: { publicUrl: "https://example.com/file.jpg" } }));
  const storageFromMock = vi.fn(() => ({
    upload: storageUploadMock,
    getPublicUrl: storageGetPublicUrlMock,
    remove: storageRemoveMock,
  }));

  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: profileSelectMock,
        update: profileUpdateMock,
      };
    }

    if (table === "dogs") {
      return {
        select: dogsSelectMock,
        update: dogsUpdateMock,
        insert: dogsInsertMock,
        delete: dogsDeleteMock,
      };
    }

    return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
      update: vi.fn(() => ({ eq: vi.fn() })),
      insert: vi.fn(),
      delete: vi.fn(() => ({ eq: vi.fn() })),
    };
  });

  return {
    getUserMock,
    signOutMock,
    updateUserMock,
    fromMock,
    profileSelectSingleMock,
    profileUpdateMock,
    profileUpdateEqMock,
    dogsOrderMock,
    dogsUpdateMock,
    dogsUpdateEqMock,
    dogsDeleteEqMock,
    storageFromMock,
    storageRemoveMock,
  };
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: getUserMock,
      signOut: signOutMock,
      updateUser: updateUserMock,
    },
    from: fromMock,
    storage: {
      from: storageFromMock,
    },
  },
}));

import ProfilePage from "../../app/profile/page";

describe("Profile page interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));

    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
    });

    profileSelectSingleMock.mockResolvedValue({
      data: {
        id: "user-1",
        display_name: "Initial Name",
        role: "user",
        avatar_url: null,
        updated_at: null,
        deleted_at: null,
        is_public: false,
      },
      error: null,
    });

    dogsOrderMock.mockResolvedValue({ data: [], error: null });
    profileUpdateEqMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
    dogsUpdateEqMock.mockResolvedValue({ error: null });
    dogsDeleteEqMock.mockResolvedValue({ error: null });
    storageRemoveMock.mockResolvedValue({ error: null });
  });

  it("saves updated display name and public flag", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Your Profile")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Your name"), {
      target: { value: "Updated Name" },
    });

    fireEvent.click(screen.getByLabelText(/Make my profile public/i));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(profileUpdateMock).toHaveBeenCalledTimes(2);
    });

    expect(profileUpdateMock).toHaveBeenNthCalledWith(1, {
      display_name: "Updated Name",
      is_public: true,
    });
    expect(profileUpdateMock).toHaveBeenNthCalledWith(2, {
      display_name: "Updated Name",
      is_public: true,
    });
    expect(profileUpdateEqMock).toHaveBeenCalledWith("id", "user-1");
  });

  it("shows password mismatch validation and does not call updateUser", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Your Profile")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(screen.getAllByText("Passwords do not match.").length).toBeGreaterThan(0);
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("shows validation error when adding a dog without name", async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Your Profile")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add dog" }));

    await waitFor(() => {
      expect(screen.getAllByText("Dog name is required.").length).toBeGreaterThan(0);
    });
  });

  it("deletes stored dog photos when a dog is removed", async () => {
    const dog = {
      id: "dog-1",
      owner_id: "user-1",
      name: "Fido",
      breed: "Labrador",
      dob: "2020-05-17",
      age_years: 5,
      photo_urls: [
        "https://project.supabase.co/storage/v1/object/public/dogs/user-1/dog-1/photo-1.jpg",
      ],
      is_public: true,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    };

    dogsOrderMock
      .mockResolvedValueOnce({ data: [dog], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Fido")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(dogsDeleteEqMock).toHaveBeenCalledWith("id", "dog-1");
    });

    expect(storageFromMock).toHaveBeenCalledWith("dogs");
    expect(storageRemoveMock).toHaveBeenCalledWith(["user-1/dog-1/photo-1.jpg"]);
  });

  it("deletes the storage object when a single dog photo is removed", async () => {
    const firstPhoto = "https://project.supabase.co/storage/v1/object/public/dogs/user-1/dog-1/photo-1.jpg";
    const secondPhoto = "https://project.supabase.co/storage/v1/object/public/dogs/user-1/dog-1/photo-2.jpg";
    const dog = {
      id: "dog-1",
      owner_id: "user-1",
      name: "Fido",
      breed: "Labrador",
      dob: "2020-05-17",
      age_years: 5,
      photo_urls: [firstPhoto, secondPhoto],
      is_public: true,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    };

    dogsOrderMock
      .mockResolvedValueOnce({ data: [dog], error: null })
      .mockResolvedValueOnce({ data: [{ ...dog, photo_urls: [secondPhoto] }], error: null });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText("Fido")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByTitle("Remove photo")[0]);

    await waitFor(() => {
      expect(dogsUpdateMock).toHaveBeenCalledWith({ photo_urls: [secondPhoto] });
    });

    expect(dogsUpdateEqMock).toHaveBeenCalledWith("id", "dog-1");
    expect(storageFromMock).toHaveBeenCalledWith("dogs");
    expect(storageRemoveMock).toHaveBeenCalledWith(["user-1/dog-1/photo-1.jpg"]);
  });
});
