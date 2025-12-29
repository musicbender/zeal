import { Module } from '@nestjs/common';
import { SensorsController } from './sensors.controller';
import { SensorService } from './sensors.service';

@Module({
  controllers: [SensorsController],
  providers: [SensorService],
})
export class SensorsModule {}
