import { Test, TestingModule } from '@nestjs/testing';

import { SensorsController } from './sensors.controller.js';
import { SensorService } from './sensors.service.js';

describe('SensorsController', () => {
  let controller: SensorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SensorsController],
      providers: [SensorService],
    }).compile();

    controller = module.get<SensorsController>(SensorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
