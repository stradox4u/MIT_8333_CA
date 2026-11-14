import { Module } from '@nestjs/common';
import { StorageModule, S3Disk } from '@nestjs/storage';
import { AppConfig } from '../config/app-config.js';
import { PhotosRepository } from './photos.repository.js';
import { Photos } from './photos.js';
import { PhotoUploadsController } from './photo-uploads.controller.js';

@Module({
  imports: [
    StorageModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const { keyPrefix: _, ...options } = config.photoStorage;
        return {
          default: 'photos',
          disks: {
            photos: new S3Disk({
              ...options,
              timeout: '5s',
              retry: { attempts: 1 },
            }),
          },
        };
      },
    }),
  ],
  controllers: [PhotoUploadsController],
  providers: [PhotosRepository, Photos],
  exports: [Photos],
})
export class PhotosModule {}
