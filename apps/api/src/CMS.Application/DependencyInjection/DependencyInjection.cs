using System.Reflection;
using CMS.Application.BackgroundJobs;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace CMS.Application.DependencyInjection;

/// <summary>
/// Extension methods for registering Application layer services.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        var assembly = Assembly.GetExecutingAssembly();

        // MediatR (CQRS)
        services.AddMediatR(cfg =>
        {
            cfg.RegisterServicesFromAssembly(assembly);
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(Behaviors.ValidationBehavior<,>));
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(Behaviors.LoggingBehavior<,>));
            cfg.AddBehavior(typeof(IPipelineBehavior<,>), typeof(Behaviors.PerformanceBehavior<,>));
        });

        // AutoMapper
        services.AddAutoMapper(cfg => cfg.AddMaps(assembly));

        // FluentValidation
        services.AddValidatorsFromAssembly(assembly);

        // Push 10.3 — FFmpeg transcoding pipeline: one bounded in-memory queue (handlers
        // enqueue via ITranscodingQueue at complete-upload) + the single-consumer hosted
        // worker. Register the concrete type once and forward the interface so handlers
        // and worker share ONE channel instance.
        services.AddSingleton<TranscodingChannelQueue>();
        services.AddSingleton<ITranscodingQueue>(sp => sp.GetRequiredService<TranscodingChannelQueue>());
        // Push 10.8 — the abort bridge: abort-processing handlers cancel the worker's
        // in-flight job (killing FFmpeg) through this shared registry.
        services.AddSingleton<ITranscodingJobRegistry, TranscodingJobRegistry>();
        services.AddHostedService<VideoTranscodingService>();

        // Wave 11.9 — Ghostscript PDF pre-processing pipeline (cloned 10.3 architecture):
        // one bounded in-memory queue (handlers enqueue via IPdfProcessingQueue at
        // complete-upload for application/pdf assets) + the single-consumer hosted worker.
        // The runner is a singleton so tests can substitute it (InternalsVisibleTo CMS.Tests).
        services.AddSingleton<PdfProcessingChannelQueue>();
        services.AddSingleton<IPdfProcessingQueue>(sp => sp.GetRequiredService<PdfProcessingChannelQueue>());
        services.AddSingleton<IGhostscriptRunner, ProcessGhostscriptRunner>();
        services.AddHostedService<PdfProcessingService>();

        return services;
    }
}
