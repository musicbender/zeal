import { Room, SensorType } from '@repo/types';

export class CreateSensorDto {
  name: string;
  type: SensorType;
  room: Room | null;
} 
