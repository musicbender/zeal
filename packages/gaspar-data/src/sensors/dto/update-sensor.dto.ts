import { PartialType } from '@nestjs/mapped-types';
import { Sensor } from 'sensors/entities/sensor.entity';

export class UpdateSensorDto extends PartialType(Sensor) {}
