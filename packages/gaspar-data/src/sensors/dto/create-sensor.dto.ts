import { Room, SensorType } from '@repo/types';

export class CreateSensorDto {
  declare name: string;
  declare type: SensorType;
  declare room: Room | null;
}
