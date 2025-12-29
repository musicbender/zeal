import { Room, SensorType } from '@repo/types';

export class Sensor {
  id: string;
  name: string;
  type: SensorType;
  room: Room | null;
  isActive: boolean;
  activeSince?: string | null;
  updatedAt: string;
  createdAt: string;
}