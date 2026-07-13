import { create } from "zustand";

export interface Service {
  id: string;
  host: string;
  port: number;
  name?: string;
  lastSynced?: Date;
}

export type AddService = Omit<Service, "id">;

interface ServiceStore {
  services: Service[];
  addService: (service: AddService) => void;
  removeService: (id: string) => void;
}

export const useServiceStore = create<ServiceStore>((set) => ({
  services: [],
  addService: (service) =>
    set((state) => ({
      services: [
        ...state.services,
        { ...service, id: new Date().getTime().toString() },
      ],
    })),
  removeService: (id) =>
    set((state) => ({
      services: state.services.filter((service) => service.id !== id),
    })),
}));
